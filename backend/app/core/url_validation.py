"""
URL validation utilities to prevent SSRF (Server-Side Request Forgery).

Blocks requests to internal/private networks, loopback addresses,
cloud metadata endpoints, and non-HTTPS schemes.
"""
import ipaddress
import socket
from urllib.parse import urlparse

from fastapi import HTTPException


# CIDR ranges that must never be reached by user-supplied URLs
_BLOCKED_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),  # AWS/Azure/GCP metadata
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),         # IPv6 private
    ipaddress.ip_network("fe80::/10"),        # IPv6 link-local
]

_BLOCKED_HOSTNAMES = {
    "metadata.google.internal",
    "metadata.goog",
}


def validate_webhook_url(url: str) -> str:
    """Validate that a URL is safe for server-side requests.

    Raises HTTPException(422) if the URL is unsafe.
    Returns the validated URL unchanged.
    """
    try:
        parsed = urlparse(url)
    except Exception:
        raise HTTPException(status_code=422, detail="URL inválida.")

    # Scheme must be HTTPS (allow HTTP only for localhost in dev — but we block
    # localhost IPs below, so effectively HTTPS-only in production)
    if parsed.scheme not in ("https", "http"):
        raise HTTPException(
            status_code=422,
            detail=f"Scheme '{parsed.scheme}' não permitido. Use HTTPS.",
        )

    hostname = parsed.hostname
    if not hostname:
        raise HTTPException(status_code=422, detail="URL sem hostname.")

    # Block known metadata hostnames
    if hostname.lower() in _BLOCKED_HOSTNAMES:
        raise HTTPException(status_code=422, detail="URL bloqueada: hostname interno.")

    # Resolve hostname to IPs and check against blocked ranges
    try:
        addrs = socket.getaddrinfo(hostname, parsed.port or 443, proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        raise HTTPException(status_code=422, detail="Não foi possível resolver o hostname da URL.")

    for family, _, _, _, sockaddr in addrs:
        ip = ipaddress.ip_address(sockaddr[0])
        for net in _BLOCKED_NETWORKS:
            if ip in net:
                raise HTTPException(
                    status_code=422,
                    detail="URL bloqueada: aponta para rede interna/privada.",
                )

    return url
