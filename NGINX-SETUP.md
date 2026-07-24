# Setup Nginx com Subdomínios para Monitoring

## 📋 Checklist de Implementação

- [ ] Copiar arquivo `nginx-monitoring.conf` para servidor
- [ ] Validar sintaxe nginx
- [ ] Configurar certificado SSL
- [ ] Habilitar site no nginx
- [ ] Testar acesso remoto
- [ ] Configurar DNS

## 🚀 Passo 1: Copiar Configuração

```bash
# No seu servidor (onde está o nginx)
scp nginx-monitoring.conf user@cloudatlas.app.br:/tmp/

# Ou via git se estiver em produção
cd /var/www/cloud-atlas-manager
git pull  # pega nginx-monitoring.conf
```

## 🔐 Passo 2: Certificado SSL

### Opção A: Let's Encrypt (Recomendado)

Se já tem certificado wildcard para `*.cloudatlas.app.br`:

```bash
# Verificar certificado existente
ls -la /etc/letsencrypt/live/cloudatlas.app.br/

# Deve ter: fullchain.pem e privkey.pem
```

Se NÃO tem ainda:

```bash
# Instalar certbot (se não tiver)
sudo apt-get install certbot python3-certbot-nginx -y

# Gerar wildcard para cloudatlas.app.br
sudo certbot certonly --manual --preferred-challenges=dns \
  -d cloudatlas.app.br \
  -d *.cloudatlas.app.br

# Ou se usar DNS automático (Route53/Cloudflare)
sudo certbot certonly --dns-route53 \
  -d cloudatlas.app.br \
  -d *.cloudatlas.app.br
```

### Opção B: Certificado Existente

Se já tem SSL para o domínio principal, use os mesmos paths no nginx config:

```bash
# Verificar o que tem
sudo ls -la /etc/letsencrypt/live/

# Atualizar paths em nginx-monitoring.conf se necessário
ssl_certificate /seu/path/aqui/fullchain.pem;
ssl_certificate_key /seu/path/aqui/privkey.pem;
```

## 📝 Passo 3: Habilitar Site no Nginx

```bash
# Copiar para sites-available
sudo cp /tmp/nginx-monitoring.conf /etc/nginx/sites-available/monitoring-cloudatlas

# Criar symlink para sites-enabled
sudo ln -s /etc/nginx/sites-available/monitoring-cloudatlas \
           /etc/nginx/sites-enabled/monitoring-cloudatlas

# Validar sintaxe
sudo nginx -t

# Deve mostrar:
# nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
# nginx: configuration will be successful
```

## 🔄 Passo 4: Recarregar Nginx

```bash
sudo systemctl reload nginx

# Verificar status
sudo systemctl status nginx

# Ver logs em tempo real (para debug)
sudo tail -f /var/log/nginx/prometheus-access.log
sudo tail -f /var/log/nginx/grafana-access.log
```

## 🌐 Passo 5: Configurar DNS

Adicione registros DNS em seu provider (Route53, Cloudflare, etc):

```
Tipo: A
Nome: metrics.cloudatlas.app.br
Valor: 1.2.3.4  (IP do seu servidor)

---

Tipo: A
Nome: grafana.cloudatlas.app.br
Valor: 1.2.3.4  (IP do seu servidor)
```

**Ou use CNAME se preferir:**

```
Tipo: CNAME
Nome: metrics.cloudatlas.app.br
Valor: cloudatlas.app.br

---

Tipo: CNAME
Nome: grafana.cloudatlas.app.br
Valor: cloudatlas.app.br
```

⏳ **Aguarde propagação DNS (5-30 min)**

## ✅ Passo 6: Testar Acesso

```bash
# Da sua máquina local
curl -I https://metrics.cloudatlas.app.br/
curl -I https://grafana.cloudatlas.app.br/

# Deve retornar 200 ou redirecionamento (não 502/503)
```

Abrir em browser:
- https://metrics.cloudatlas.app.br/ → Prometheus
- https://grafana.cloudatlas.app.br/ → Grafana (admin/admin)

## 🔧 Troubleshooting

### 502 Bad Gateway

```bash
# Verificar se Prometheus/Grafana estão rodando
docker-compose ps

# Se não estiverem:
docker-compose up -d

# Verificar logs
docker logs cloudatlas-prometheus
docker logs cloudatlas-grafana
```

### Connection Refused

```bash
# Verificar se portas 9090/3001 estão abertas localmente
netstat -tlnp | grep -E '9090|3001'

# Firewall bloqueando?
sudo ufw allow 9090
sudo ufw allow 3001

# (Mas NÃO exponha diretamente - use nginx como proxy)
```

### Certificado SSL Inválido

```bash
# Renew certificado Let's Encrypt
sudo certbot renew --dry-run

# Ou força renew
sudo certbot renew --force-renewal

# Recarregar nginx
sudo systemctl reload nginx
```

### Logs detalhados

```bash
# Ver logs nginx
sudo journalctl -u nginx -f

# Ver erro específico
sudo tail -50 /var/log/nginx/prometheus-error.log
sudo tail -50 /var/log/nginx/grafana-error.log
```

## 🔒 Segurança Extra (Opcional)

### Adicionar Autenticação Básica ao Prometheus

```nginx
# Gerar user:pass com htpasswd
sudo apt-get install apache2-utils -y
sudo htpasswd -c /etc/nginx/.htpasswd admin

# Adicionar ao bloco Prometheus:
location / {
    auth_basic "Prometheus";
    auth_basic_user_file /etc/nginx/.htpasswd;
    proxy_pass http://prometheus_backend;
    # ... resto da config
}
```

### Limitar IP de Acesso (somente seu escritório)

```nginx
location / {
    # Permitir seu IP
    allow 200.1.2.3;  # Seu IP público
    deny all;
    
    proxy_pass http://prometheus_backend;
    # ... resto da config
}
```

## 📅 Automação: Renovação de Certificado

```bash
# Criar cron job para renovar a cada 2 meses
sudo crontab -e

# Adicionar:
0 3 1 * * /usr/bin/certbot renew --quiet && /usr/sbin/systemctl reload nginx
```

## 📊 Monitorar Status Remoto

Agora pode acessar:

```
Prometheus:  https://metrics.cloudatlas.app.br
Grafana:     https://grafana.cloudatlas.app.br
```

Via:
- 🖥️ Desktop remoto
- 📱 Mobile/Tablet
- 🌐 Qualquer navegador

## 🚨 Performance Notes

Para 200-user migration, monitorar:

```
https://grafana.cloudatlas.app.br
  → Overview Dashboard
    → Taxa de Conclusão (deve estar acima de 3 tasks/min)
    → Fila Pendente (deve estar caindo ao longo do tempo)
    → Uso de Memória (deve estar <2.5GB)
```

## ❌ Rollback (se precisar desabilitar)

```bash
# Desabilitar temporariamente
sudo unlink /etc/nginx/sites-enabled/monitoring-cloudatlas
sudo systemctl reload nginx

# Ou remover permanentemente
sudo rm /etc/nginx/sites-available/monitoring-cloudatlas
sudo rm /etc/nginx/sites-enabled/monitoring-cloudatlas
```

## 📞 Suporte

Qualquer problema após setup:

1. Verificar: `sudo nginx -t`
2. Logs: `sudo tail -50 /var/log/nginx/*error.log`
3. Containers: `docker-compose logs -f`
4. DNS: `nslookup metrics.cloudatlas.app.br`
