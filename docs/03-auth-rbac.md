# 03 — Autenticação & RBAC

## Fluxos de Autenticação

### E-mail + Senha
```
POST /auth/register
  → cria User (is_verified=false)
  → envia e-mail com token de verificação
  → redireciona para /select-plan

GET /auth/verify/{token}
  → marca is_verified=true
  → redireciona para /

POST /auth/login
  → valida email + bcrypt
  → se mfa_enabled=true → retorna {mfa_required: true, mfa_token: JWT 10min}
  → se mfa_enabled=false → retorna {access_token, refresh_token}
```

### MFA por E-mail
```
POST /auth/login
  → retorna {mfa_required: true, mfa_token}

POST /auth/mfa/verify  (Header: Authorization: Bearer <mfa_token>)
  → valida OTP de 6 dígitos
  → retorna {access_token, refresh_token}

POST /auth/mfa/resend  (Header: Authorization: Bearer <mfa_token>)
  → gera novo OTP e reenvia e-mail (rate limited)
```

### SSO (Google / GitHub)
```
GET /auth/{provider}/login
  → redireciona para OAuth do provedor

GET /auth/{provider}/callback?code=...
  → troca code por token
  → cria ou atualiza User (oauth_provider, oauth_id, avatar_url)
  → retorna JWT normal
```

### Refresh de Token
```
POST /auth/refresh
  Body: { refresh_token: "..." }
  → valida token_hash no banco (revoked=false, expires_at > now)
  → revoga o token atual (single-use rotation)
  → emite novo par {access_token, refresh_token}

Revoke-on-reuse: se um token revogado for apresentado novamente,
TODOS os tokens do usuário são invalidados (ataque detectado).
```

---

## Tokens

| Token | TTL | Algoritmo | Payload |
|-------|-----|-----------|---------|
| `access_token` | 30 min | HS256 (SECRET_KEY) | `{sub: user_id, exp}` |
| `refresh_token` | 7 dias | SHA-256 hash no banco | opaco |
| `mfa_token` | 10 min | HS256 | `{sub: user_id, scope: "mfa", exp}` |

---

## Guards (Dependencies FastAPI)

```python
# Rota pública → sem guard
# Rota autenticada (qualquer usuário)
get_current_user(token) → User

# Rota de membro de workspace
get_current_member(org_slug, workspace_id, user) → MemberContext

# Rota com permissão específica
require_permission("finops.apply") → MemberContext  # 403 se não tem permissão

# Rota org-level (sem workspace)
require_org_permission("m365.view") → MemberContext

# Rota admin da plataforma
get_current_admin(user) → User  # 403 se is_admin=false
```

### MemberContext
```python
@dataclass
class MemberContext:
    user: User
    organization_id: UUID
    workspace_id: UUID
    role: str          # papel efetivo (workspace override > org role)
```

---

## RBAC — Permissões por Papel

O sistema tem 19 permissões nomeadas. Cada endpoint usa `require_permission("nome.acao")`.

| Permissão | owner | admin | operator | viewer | billing |
|-----------|:-----:|:-----:|:--------:|:------:|:-------:|
| `resources.view` | ✅ | ✅ | ✅ | ✅ | — |
| `resources.manage` | ✅ | ✅ | ✅ | — | — |
| `costs.view` | ✅ | ✅ | — | — | ✅ |
| `alerts.view` | ✅ | ✅ | — | — | ✅ |
| `alerts.manage` | ✅ | ✅ | — | — | ✅ |
| `logs.view` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `members.view` | ✅ | ✅ | — | — | — |
| `members.manage` | ✅ | ✅ | — | — | — |
| `workspace.manage` | ✅ | ✅ | — | — | — |
| `org.manage` | ✅ | — | — | — | — |
| `finops.view` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `finops.recommend` | ✅ | ✅ | ✅ | — | ✅ |
| `finops.apply` | ✅ | ✅ | ✅ | — | — |
| `schedules.view` | ✅ | ✅ | ✅ | ✅ | — |
| `schedules.manage` | ✅ | ✅ | ✅ | — | — |
| `webhooks.view` | ✅ | ✅ | ✅ | ✅ | — |
| `webhooks.manage` | ✅ | ✅ | ✅ | — | — |
| `m365.view` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `m365.manage` | ✅ | ✅ | ✅ | — | — |

---

## Criptografia de Credenciais Cloud

As credenciais cloud dos workspaces são criptografadas com **Fernet** (AES-128-CBC + HMAC-SHA256) antes de armazenar no banco:

```python
# auth_service.py

from cryptography.fernet import Fernet

# Chave derivada do SECRET_KEY (ou ENCRYPTION_KEY explícita no .env)
fernet = Fernet(ENCRYPTION_KEY)

def encrypt_credential(data: dict) -> str:
    return fernet.encrypt(json.dumps(data).encode()).decode()

def decrypt_credential(encrypted: str) -> dict:
    return json.loads(fernet.decrypt(encrypted.encode()).decode())
```

> **Nunca** armazenar credenciais em texto puro. O campo `CloudAccount.encrypted_data` sempre contém o valor criptografado.

---

## MFA — Implementação

```
1. Usuário faz login → backend detecta mfa_enabled=true
2. Gera OTP de 6 dígitos aleatórios
3. Hash do OTP com bcrypt → salva em users.mfa_secret
4. Envia OTP por e-mail (send_otp_email)
5. Retorna mfa_token (JWT 10min scope=mfa) para o frontend
6. Frontend exibe tela OTP
7. Usuário digita código → POST /auth/mfa/verify com Bearer mfa_token
8. Backend valida bcrypt(otp, mfa_secret) e exp do mfa_token
9. Emite access_token + refresh_token normais
```

OTP expira junto com o mfa_token (10 min). Reenvio cria novo OTP e invalida o anterior.

---

## Frontend — Fluxo de Auth (AuthContext)

```jsx
// AuthContext.jsx
login(credentials) {
  response = POST /auth/login
  if (response.mfa_required) {
    // salva mfa_token, exibe tela OTP
    return early
  }
  // armazena access_token no localStorage
  // configura interceptor Axios para Bearer
  // inicia refresh timer
}

// api.js — interceptor de 401
response.interceptors.response.use(null, async (error) => {
  if (error.response.status === 401) {
    // tenta POST /auth/refresh
    // se falhar → limpa token → redireciona /login
  }
})
```
