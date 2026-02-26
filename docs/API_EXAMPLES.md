# Exemplos de Uso da API — Cloud Hub Manager

Base URL: `http://localhost:8000/api/v1`

Todos os endpoints (exceto `/auth/login` e `/auth/register`) requerem o header:
```
Authorization: Bearer <token>
```

---

## Autenticação

### Registrar conta
```bash
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"João","email":"joao@empresa.com","password":"SenhaSegura123"}'
```

### Login
```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"joao@empresa.com","password":"SenhaSegura123"}'
```

**Resposta:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "user": {
    "id": "uuid",
    "name": "João",
    "email": "joao@empresa.com",
    "is_admin": false
  }
}
```

Salve o token para usar nas próximas requisições:
```bash
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
ORG="minha-org"
WS="uuid-do-workspace"
```

---

## Recursos AWS

### Listar instâncias EC2
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/orgs/$ORG/workspaces/$WS/aws/ec2/instances"
```

### Iniciar / Parar EC2
```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/orgs/$ORG/workspaces/$WS/aws/ec2/instances/i-0abc123/start"

curl -X POST -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/orgs/$ORG/workspaces/$WS/aws/ec2/instances/i-0abc123/stop"
```

### Custos AWS (Cost Explorer)
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/orgs/$ORG/workspaces/$WS/aws/costs"
```

---

## Recursos Azure

### Listar VMs
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/orgs/$ORG/workspaces/$WS/azure/vms"
```

### Listar App Services
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/orgs/$ORG/workspaces/$WS/azure/app-services"
```

---

## Recursos GCP

### Listar Compute Engine
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/orgs/$ORG/workspaces/$WS/gcp/compute/instances"
```

### Listar Cloud Storage
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/orgs/$ORG/workspaces/$WS/gcp/storage/buckets"
```

---

## FinOps (Pro)

### Escanear recomendações
```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/orgs/$ORG/workspaces/$WS/finops/scan"
```

### Listar recomendações
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/orgs/$ORG/workspaces/$WS/finops/recommendations"
```

### Aplicar recomendação
```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/orgs/$ORG/workspaces/$WS/finops/recommendations/uuid/apply"
```

---

## Alertas de Custo

### Criar alerta
```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Alerta AWS mensal",
    "provider": "aws",
    "threshold_type": "fixed",
    "threshold_value": 500.00,
    "period": "monthly"
  }' \
  "http://localhost:8000/api/v1/orgs/$ORG/workspaces/$WS/alerts"
```

### Avaliar alertas contra custo atual
```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"provider":"aws","current_value":650.00,"period":"monthly"}' \
  "http://localhost:8000/api/v1/orgs/$ORG/workspaces/$WS/alerts/evaluate"
```

---

## Agendamentos (Pro)

### Criar agendamento de stop noturno
```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Desligar dev às 20h",
    "provider": "aws",
    "resource_type": "ec2",
    "resource_id": "i-0abc123def",
    "resource_name": "dev-server",
    "action": "stop",
    "schedule_type": "weekdays",
    "schedule_time": "20:00",
    "timezone": "America/Sao_Paulo"
  }' \
  "http://localhost:8000/api/v1/orgs/$ORG/workspaces/$WS/schedules"
```

### Listar agendamentos
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/orgs/$ORG/workspaces/$WS/schedules"
```

---

## Webhooks (Pro)

### Criar webhook
```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Slack Alerts",
    "url": "https://hooks.slack.com/services/xxx/yyy/zzz",
    "events": ["alert.triggered", "resource.stopped", "finops.scan.completed"]
  }' \
  "http://localhost:8000/api/v1/orgs/$ORG/workspaces/$WS/webhooks"
```

**Resposta (guarde o `secret` — exibido apenas uma vez):**
```json
{
  "id": "uuid",
  "name": "Slack Alerts",
  "url": "https://hooks.slack.com/services/xxx/yyy/zzz",
  "events": ["alert.triggered", "resource.stopped", "finops.scan.completed"],
  "is_active": true,
  "secret": "a1b2c3d4e5f6...",
  "created_at": "2026-02-26T12:00:00"
}
```

### Enviar teste
```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/orgs/$ORG/workspaces/$WS/webhooks/uuid/test"
```

### Ver histórico de entregas
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/orgs/$ORG/workspaces/$WS/webhooks/uuid/deliveries?page=1"
```

### Rotacionar segredo
```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/orgs/$ORG/workspaces/$WS/webhooks/uuid/regenerate-secret"
```

### Verificar assinatura no seu servidor (Python)
```python
import hmac
import hashlib

def verify_webhook(body: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(
        secret.encode(),
        body,
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(f"sha256={expected}", signature)

# Uso com Flask
from flask import request
@app.route("/webhook", methods=["POST"])
def receive():
    sig = request.headers.get("X-CloudHub-Signature", "")
    if not verify_webhook(request.data, sig, "seu-secret-aqui"):
        return "Unauthorized", 401
    payload = request.json
    print(payload["event"], payload["data"])
    return "", 200
```

**Formato do payload recebido:**
```json
{
  "event": "alert.triggered",
  "workspace_id": "uuid",
  "timestamp": "2026-02-26T15:30:00Z",
  "data": {
    "alert_id": "uuid",
    "message": "Alerta 'AWS mensal': custo de $650.00 atingiu limite de $500.00",
    "provider": "aws",
    "current_value": 650.00
  }
}
```

---

## Admin (is_admin = true)

### Listar leads Enterprise
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/admin/leads?status=new"
```

### Atualizar status do lead
```bash
curl -X PUT -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"converted"}' \
  "http://localhost:8000/api/v1/admin/leads/uuid"
```

### Alterar plano de uma organização
```bash
curl -X PUT -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"plan_tier":"enterprise"}' \
  "http://localhost:8000/api/v1/admin/orgs/slug-da-org/plan"
```

---

## Health Check

```bash
curl http://localhost:8000/health
```

```json
{"status": "healthy", "version": "0.3.0"}
```

## Documentação Interativa

Acesse `http://localhost:8000/docs` para a interface Swagger com todos os endpoints documentados e testáveis.
