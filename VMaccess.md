# Planejamento: Acesso Remoto a VMs (Multi-Cloud)

## Tipos de Acesso Viáveis

| Tipo | Viabilidade | Complexidade | Recomendação |
|------|-------------|--------------|--------------|
| SSH via WebSocket (xterm.js) | Alta | Média | Linux VMs |
| RDP via browser (Guacamole) | Média | Alta | Requer container extra |
| Serial Console | Média | Média | Fallback útil |
| Cloud-native (SSM/Bastion/IAP) | Alta | Baixa | Melhor início |

---

## Opções de Arquitetura

### Opção A — WebSocket Proxy no Backend
O backend FastAPI atua como proxy SSH/RDP via WebSocket. Frontend usa xterm.js.

- **Prós:** Experiência unificada, controle total sobre sessões
- **Contras:** Container precisa de acesso de rede às VMs, gerenciamento de chaves SSH, superfície de ataque maior

### Opção B — Cloud-Native
Cada provider tem seu mecanismo nativo. O backend gera URLs/tokens temporários.

- **AWS:** SSM Session Manager (sem SSH key, usa IAM)
- **Azure:** Serial Console + Bastion link
- **GCP:** Console SSH + Serial Port Output

- **Prós:** Sem acesso de rede direto, segurança gerenciada pelo provider, zero chaves SSH
- **Contras:** Experiência varia por provider, requer pré-requisitos (SSM Agent, Bastion subnet, etc.)

### Opção C — Híbrida (Recomendada)

**Fase 1** — Cloud-Native (entrega rápida, sem mudanças Docker)
**Fase 2** — Terminal SSH integrado via xterm.js + asyncssh (experiência premium)

---

## Implementação por Provider

### AWS — SSM Session Manager

```
aws_service.py:
  - get_ssm_status(instance_id)       → verifica SSM Agent online
  - start_ssm_session(instance_id)    → inicia sessão SSM
  - get_console_output(instance_id)   → saída serial

aws.py:
  - GET  /ec2/{instance_id}/ssm-status
  - POST /ec2/{instance_id}/ssm-session
  - GET  /ec2/{instance_id}/console-output
```

**Permissões IAM:** `ssm:StartSession`, `ssm:TerminateSession`, `ssm:DescribeInstanceInformation`

### Azure — Serial Console + Bastion

```
azure_service.py:
  - get_remote_access_urls(rg, vm)    → URLs do portal (serial console, bastion)
  - get_boot_diagnostics(rg, vm)      → screenshot + log serial

azure.py:
  - GET /vms/{rg}/{vm}/remote-access
  - GET /vms/{rg}/{vm}/boot-diagnostics
```

### GCP — Console SSH + Serial Port

```
gcp_service.py:
  - get_ssh_console_url(zone, name)        → URL do SSH-in-browser
  - get_serial_port_output(zone, name)     → log da porta serial

gcp.py:
  - GET /instances/{zone}/{name}/remote-access
  - GET /instances/{zone}/{name}/serial-output
```

---

## Componentes Frontend

1. **`RemoteAccessSection.jsx`** — seção no `extraContent` do drawer de cada VM
   - Detecta SO (Linux/Windows)
   - Botões: "Abrir Console SSH", "Abrir RDP/Bastion", "Console Serial"
   - Indicador de status (ex: "SSM Online")

2. **`SerialConsoleModal.jsx`** — modal fullscreen com output serial
   - Monospace, auto-scroll, botão atualizar, dark mode

3. **`TerminalEmbed.jsx`** (Fase 2) — terminal xterm.js integrado
   - WebSocket → backend → SSH → VM
   - Deps: `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-web-links`

---

## Segurança & Auditoria

- Nova tabela `remote_sessions` (id, workspace_id, user_id, provider, resource_id, session_type, started_at, ended_at, ip_address)
- `log_activity()` + `push_notification()` em cada acesso
- Permissão `remote_access` no sistema de roles
- Fase 2: tabela `ssh_keys` com chaves criptografadas via Fernet

---

## Dependências

| | Fase 1 (Cloud-Native) | Fase 2 (Terminal SSH) |
|---|---|---|
| Backend | Nenhuma nova | `asyncssh>=2.14.0` |
| Frontend | Nenhuma nova | `@xterm/xterm`, addons |
| Docker | Sem mudança | Proxy WS no Vite |

---

## Sequência de Implementação

### Fase 1 — Cloud-Native

1. Migration: tabela `remote_sessions`
2. Backend: métodos + endpoints nos 3 providers
3. Frontend: `RemoteAccessSection` + `SerialConsoleModal`
4. Integrar nos drawers de AzureVMs, AwsEC2, GcpCompute

### Fase 2 — Terminal Integrado

1. Backend: endpoint WebSocket SSH com `asyncssh`
2. Frontend: `TerminalEmbed.jsx` com xterm.js
3. Migration: tabela `ssh_keys`
4. UI de gerenciamento de chaves SSH

---

## Desafios

- **SSM no browser**: `start_session()` requer `session-manager-plugin` local. Alternativa: gerar URL federada do AWS Console via `sts:GetFederationToken`
- **Iframe bloqueado**: Portais cloud usam `X-Frame-Options: DENY`. Solução: abrir em nova aba
- **Rede (Fase 2)**: Container backend precisa de rota de rede até as VMs — em produção exige VPN/peering
- **Detecção de SO**: Azure retorna `os_type`, AWS usa field `Platform`, GCP precisa inferir dos discos
