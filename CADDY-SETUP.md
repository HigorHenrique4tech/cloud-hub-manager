# Setup Caddy com Subdomínios para Monitoring

## ✨ Por que Caddy é melhor que Nginx

- ✅ HTTPS automático (Let's Encrypt built-in)
- ✅ Reload sem downtime
- ✅ Sintaxe simples e limpa
- ✅ Já está rodando em produção
- ✅ Configuração única vs múltiplos arquivos

## 📋 Seu Setup Atual

```
┌─────────────────────────┐
│   cloudatlas.app.br     │
│    (Caddy porta 80/443) │
└────────────┬────────────┘
             │
    ┌────────┴────────┬────────────┬─────────────┐
    │                 │            │             │
  Frontend       Backend      Cloud-Atlas     Monitoring
  (3000/3001)    (8000)      Manager     (Prometheus)
                                          (Grafana)
```

## 🚀 Implementação Rápida

### Passo 1: Encontrar Caddyfile

```bash
# Localize o arquivo
sudo find / -name "Caddyfile" 2>/dev/null

# Provavelmente está em:
# /etc/caddy/Caddyfile
# ou
# ~/.config/caddy/Caddyfile
# ou em um docker volume
```

### Passo 2: Fazer Backup

```bash
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.backup
```

### Passo 3: Adicionar Configuração de Monitoring

**Opção A: Dentro do Caddyfile existente**

```bash
# Abrir arquivo
sudo nano /etc/caddy/Caddyfile

# Ir ao final e colar (do arquivo Caddyfile.monitoring):
```

```caddy
metrics.cloudatlas.app.br {
    reverse_proxy localhost:9090 {
        header_upstream X-Forwarded-Host {http.request.host}
        header_upstream X-Forwarded-Proto {http.request.proto}
    }
    log {
        output file /var/log/caddy/prometheus.log
    }
}

grafana.cloudatlas.app.br {
    reverse_proxy localhost:3001 {
        header_upstream X-Forwarded-Host {http.request.host}
        header_upstream X-Forwarded-Proto {http.request.proto}
        header_upstream Connection "upgrade"
        header_upstream Upgrade "websocket"
    }
    log {
        output file /var/log/caddy/grafana.log
    }
}
```

**Opção B: Arquivo separado (melhor)**

```bash
# Copiar arquivo de configuração
sudo cp Caddyfile.monitoring /etc/caddy/conf.d/monitoring.caddy

# Editar Caddyfile para importar:
sudo nano /etc/caddy/Caddyfile

# Adicionar no início ou fim:
import /etc/caddy/conf.d/monitoring.caddy
```

### Passo 4: Validar Sintaxe

```bash
# Se Caddy está em Docker:
docker exec cloudatlas-caddy caddy validate --config /etc/caddy/Caddyfile

# Se Caddy é systemd:
caddy validate --config /etc/caddy/Caddyfile
```

Deve retornar:
```
Valid configuration
```

### Passo 5: Recarregar Caddy

```bash
# Se está em Docker:
docker exec cloudatlas-caddy caddy reload --config /etc/caddy/Caddyfile

# Se é systemd:
sudo systemctl reload caddy

# Verificar status
docker ps | grep caddy
# ou
sudo systemctl status caddy
```

### Passo 6: Configurar DNS

Em seu provider (Route53, Cloudflare, etc):

```
Tipo: A (ou CNAME para cloudatlas.app.br)
Nome: metrics
Valor: seu-ip-do-servidor

---

Tipo: A (ou CNAME)
Nome: grafana  
Valor: seu-ip-do-servidor
```

Ou simplesmente:
```
metrics.cloudatlas.app.br → seu-ip
grafana.cloudatlas.app.br → seu-ip
```

### Passo 7: Testar

```bash
# Aguarde 5-10 min para DNS propagar

# Testar HTTPS automático
curl -I https://metrics.cloudatlas.app.br/
curl -I https://grafana.cloudatlas.app.br/

# Deve retornar 200 (não 502)
```

**Em navegador:**
- https://metrics.cloudatlas.app.br/ → Prometheus
- https://grafana.cloudatlas.app.br/ → Grafana (login: admin/admin)

## 🔧 Troubleshooting

### 502 Bad Gateway

```bash
# Verificar se serviços estão rodando
docker ps | grep -E "prometheus|grafana"

# Se não estiverem:
docker-compose up -d prometheus grafana

# Ver logs do Caddy
docker logs cloudatlas-caddy -f

# Ver logs de prometheus/grafana
docker logs cloudatlas-prometheus
docker logs cloudatlas-grafana
```

### DNS não resolve

```bash
# Verificar DNS
nslookup metrics.cloudatlas.app.br
nslookup grafana.cloudatlas.app.br

# Deve retornar seu IP
```

### Certificado SSL inválido

Caddy renova automaticamente, mas:

```bash
# Forçar renovação
docker exec cloudatlas-caddy caddy reload --config /etc/caddy/Caddyfile

# Ver certificados
ls -la /var/lib/caddy/certificates/
```

### Erros no Caddyfile

```bash
# Ver logs detalhados
docker logs cloudatlas-caddy -f

# Validar de novo
docker exec cloudatlas-caddy caddy validate --config /etc/caddy/Caddyfile
```

## 📝 Caddyfile Completo (Exemplo)

Se não tem Caddyfile ainda:

```caddy
# Seu site principal já existente
cloudatlas.app.br {
    reverse_proxy localhost:3000 {
        header_upstream X-Forwarded-Proto {http.request.proto}
    }
}

# Adicionar monitoring
metrics.cloudatlas.app.br {
    reverse_proxy localhost:9090
}

grafana.cloudatlas.app.br {
    reverse_proxy localhost:3001 {
        header_upstream Connection "upgrade"
        header_upstream Upgrade "websocket"
    }
}

# Outros domínios/subdomínios aqui...
```

## 🔐 Segurança Extra

### Adicionar Autenticação Básica

```caddy
metrics.cloudatlas.app.br {
    basicauth / {
        admin $2a$14$...hash_aqui...  # Gerar com: caddy hash-password
    }
    reverse_proxy localhost:9090
}
```

Gerar hash:
```bash
docker exec cloudatlas-caddy caddy hash-password
# Digite sua senha
```

### Limitar por IP

```caddy
metrics.cloudatlas.app.br {
    # Permitir apenas seu IP
    @allowed remote_ip 200.1.2.3
    handle @allowed {
        reverse_proxy localhost:9090
    }
    
    # Bloquear resto
    respond "Forbidden" 403
}
```

## 📊 Monitorar Acesso

Logs separados:
```bash
# Prometheus access log
tail -f /var/log/caddy/prometheus.log

# Grafana access log
tail -f /var/log/caddy/grafana.log

# Caddy geral
docker logs cloudatlas-caddy -f
```

## ✅ Próximos Passos

1. **Editar Caddyfile** com as 2 rotas de monitoring
2. **Recarregar Caddy** (reload, não restart)
3. **Configurar DNS** para os subdomínios
4. **Testar** em https://metrics.cloudatlas.app.br

## 🎯 Resultado

```
✅ https://metrics.cloudatlas.app.br/      → Prometheus
✅ https://grafana.cloudatlas.app.br/      → Grafana
✅ HTTPS automático (Let's Encrypt)
✅ Sem downtime no reload
✅ Logs separados
```

## ❌ Rollback Rápido

```bash
# Se algo der errado:
sudo cp /etc/caddy/Caddyfile.backup /etc/caddy/Caddyfile
sudo systemctl reload caddy

# Ou em Docker:
docker exec cloudatlas-caddy caddy reload --config /etc/caddy/Caddyfile.backup
```
