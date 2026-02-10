# 📚 Exemplos de Uso da API

Este arquivo contém exemplos práticos de como usar a API do Cloud Hub Manager.

## 🔧 Setup Inicial

```bash
# Certifique-se de que o backend está rodando
docker-compose up -d backend

# Verifique os logs
docker-compose logs -f backend
```

## 📡 Exemplos com cURL

### 1. Health Check

```bash
curl -X GET http://localhost:8000/health
```

**Resposta:**
```json
{
  "status": "healthy",
  "version": "0.1.0",
  "timestamp": "2024-02-10T15:30:45.123456"
}
```

### 2. Testar Conexão AWS

```bash
curl -X GET http://localhost:8000/api/v1/aws/test-connection
```

**Resposta (sucesso):**
```json
{
  "success": true,
  "message": "AWS connection successful",
  "region": "us-east-1"
}
```

**Resposta (erro - sem credenciais):**
```json
{
  "success": false,
  "error": "AWS credentials not found"
}
```

### 3. Listar Instâncias EC2

```bash
curl -X GET http://localhost:8000/api/v1/aws/ec2/instances
```

**Resposta:**
```json
{
  "success": true,
  "region": "us-east-1",
  "total_instances": 3,
  "instances": [
    {
      "instance_id": "i-0abc123def456789",
      "name": "web-server-prod",
      "instance_type": "t3.medium",
      "state": "running",
      "availability_zone": "us-east-1a",
      "private_ip": "10.0.1.25",
      "public_ip": "54.123.45.67",
      "launch_time": "2024-02-01T10:30:00+00:00"
    },
    {
      "instance_id": "i-0def456abc789012",
      "name": "database-server",
      "instance_type": "t3.large",
      "state": "running",
      "availability_zone": "us-east-1b",
      "private_ip": "10.0.2.50",
      "public_ip": null,
      "launch_time": "2024-01-15T08:15:00+00:00"
    },
    {
      "instance_id": "i-0789012abc345def",
      "name": "test-server",
      "instance_type": "t3.micro",
      "state": "stopped",
      "availability_zone": "us-east-1c",
      "private_ip": "10.0.3.10",
      "public_ip": null,
      "launch_time": "2024-02-05T14:00:00+00:00"
    }
  ]
}
```

### 4. Com formatação JSON bonita

```bash
curl -X GET http://localhost:8000/api/v1/aws/ec2/instances | jq
```

### 5. Salvar resposta em arquivo

```bash
curl -X GET http://localhost:8000/api/v1/aws/ec2/instances > ec2_instances.json
```

## 🐍 Exemplos com Python

### Exemplo 1: Script Básico

```python
import requests
import json

BASE_URL = "http://localhost:8000"

# Health check
response = requests.get(f"{BASE_URL}/health")
print("Health Status:", response.json()["status"])

# Testar AWS
response = requests.get(f"{BASE_URL}/api/v1/aws/test-connection")
if response.json()["success"]:
    print("AWS conectado com sucesso!")
else:
    print("Erro ao conectar AWS:", response.json()["error"])

# Listar EC2
response = requests.get(f"{BASE_URL}/api/v1/aws/ec2/instances")
data = response.json()

print(f"\nTotal de instâncias: {data['total_instances']}")
for instance in data['instances']:
    print(f"- {instance['name']} ({instance['instance_id']}): {instance['state']}")
```

### Exemplo 2: Classe Helper

```python
import requests
from typing import Dict, List

class CloudHubClient:
    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url
    
    def health_check(self) -> Dict:
        """Verifica saúde da API"""
        response = requests.get(f"{self.base_url}/health")
        return response.json()
    
    def test_aws_connection(self) -> Dict:
        """Testa conexão com AWS"""
        response = requests.get(f"{self.base_url}/api/v1/aws/test-connection")
        return response.json()
    
    def list_ec2_instances(self) -> Dict:
        """Lista todas as instâncias EC2"""
        response = requests.get(f"{self.base_url}/api/v1/aws/ec2/instances")
        return response.json()
    
    def get_running_instances(self) -> List[Dict]:
        """Retorna apenas instâncias rodando"""
        data = self.list_ec2_instances()
        return [
            inst for inst in data['instances'] 
            if inst['state'] == 'running'
        ]
    
    def get_instance_by_name(self, name: str) -> Dict:
        """Busca instância por nome"""
        data = self.list_ec2_instances()
        for instance in data['instances']:
            if instance['name'] == name:
                return instance
        return None

# Uso
client = CloudHubClient()

# Health check
health = client.health_check()
print(f"API Status: {health['status']}")

# Listar instâncias rodando
running = client.get_running_instances()
print(f"\nInstâncias rodando: {len(running)}")
for instance in running:
    print(f"  {instance['name']}: {instance['instance_type']}")

# Buscar instância específica
web_server = client.get_instance_by_name("web-server-prod")
if web_server:
    print(f"\nWeb Server IP: {web_server['public_ip']}")
```

### Exemplo 3: Monitoramento Contínuo

```python
import requests
import time
from datetime import datetime

def monitor_instances(interval_seconds=30):
    """Monitora instâncias EC2 continuamente"""
    
    BASE_URL = "http://localhost:8000"
    
    print("Iniciando monitoramento...")
    print(f"Verificando a cada {interval_seconds} segundos")
    print("-" * 60)
    
    while True:
        try:
            # Buscar instâncias
            response = requests.get(f"{BASE_URL}/api/v1/aws/ec2/instances")
            data = response.json()
            
            # Timestamp
            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            print(f"\n[{now}] Total: {data['total_instances']} instâncias")
            
            # Contar por estado
            states = {}
            for instance in data['instances']:
                state = instance['state']
                states[state] = states.get(state, 0) + 1
            
            # Exibir estatísticas
            for state, count in states.items():
                print(f"  {state}: {count}")
            
            # Aguardar próximo ciclo
            time.sleep(interval_seconds)
            
        except KeyboardInterrupt:
            print("\n\nMonitoramento interrompido.")
            break
        except Exception as e:
            print(f"Erro: {e}")
            time.sleep(interval_seconds)

# Executar monitoramento
monitor_instances(interval_seconds=30)
```

### Exemplo 4: Gerar Relatório

```python
import requests
from datetime import datetime

def generate_ec2_report():
    """Gera relatório de instâncias EC2"""
    
    BASE_URL = "http://localhost:8000"
    
    # Buscar dados
    response = requests.get(f"{BASE_URL}/api/v1/aws/ec2/instances")
    data = response.json()
    
    # Criar relatório
    report = []
    report.append("=" * 80)
    report.append("RELATÓRIO DE INSTÂNCIAS EC2")
    report.append(f"Data: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    report.append(f"Região: {data['region']}")
    report.append(f"Total: {data['total_instances']} instâncias")
    report.append("=" * 80)
    report.append("")
    
    # Agrupar por estado
    by_state = {}
    for instance in data['instances']:
        state = instance['state']
        if state not in by_state:
            by_state[state] = []
        by_state[state].append(instance)
    
    # Exibir por estado
    for state, instances in by_state.items():
        report.append(f"\n{state.upper()} ({len(instances)})")
        report.append("-" * 80)
        
        for inst in instances:
            report.append(f"  Nome: {inst['name']}")
            report.append(f"  ID: {inst['instance_id']}")
            report.append(f"  Tipo: {inst['instance_type']}")
            report.append(f"  AZ: {inst['availability_zone']}")
            report.append(f"  IP Privado: {inst['private_ip']}")
            report.append(f"  IP Público: {inst['public_ip'] or 'N/A'}")
            report.append(f"  Iniciado em: {inst['launch_time']}")
            report.append("")
    
    # Salvar em arquivo
    filename = f"ec2_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
    with open(filename, 'w') as f:
        f.write('\n'.join(report))
    
    print(f"Relatório salvo em: {filename}")
    print('\n'.join(report))

# Gerar relatório
generate_ec2_report()
```

## 🌐 Exemplos com JavaScript/Node.js

### Exemplo Básico

```javascript
const axios = require('axios');

const BASE_URL = 'http://localhost:8000';

async function testAPI() {
    try {
        // Health check
        const health = await axios.get(`${BASE_URL}/health`);
        console.log('Status:', health.data.status);
        
        // Listar EC2
        const ec2 = await axios.get(`${BASE_URL}/api/v1/aws/ec2/instances`);
        console.log(`Total de instâncias: ${ec2.data.total_instances}`);
        
        ec2.data.instances.forEach(instance => {
            console.log(`- ${instance.name}: ${instance.state}`);
        });
        
    } catch (error) {
        console.error('Erro:', error.message);
    }
}

testAPI();
```

## 🧪 Testes Automatizados

### Script de Teste Completo

```python
import requests
import sys

BASE_URL = "http://localhost:8000"

def test_health():
    """Testa endpoint de health"""
    response = requests.get(f"{BASE_URL}/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"
    print("✓ Health check passou")

def test_aws_connection():
    """Testa conexão AWS"""
    response = requests.get(f"{BASE_URL}/api/v1/aws/test-connection")
    assert response.status_code == 200
    data = response.json()
    
    if data["success"]:
        print("✓ Conexão AWS OK")
    else:
        print("⚠ Conexão AWS falhou (verifique credenciais)")

def test_ec2_list():
    """Testa listagem EC2"""
    response = requests.get(f"{BASE_URL}/api/v1/aws/ec2/instances")
    assert response.status_code == 200
    data = response.json()
    
    assert "instances" in data
    assert "total_instances" in data
    assert "region" in data
    
    print(f"✓ Listagem EC2 OK ({data['total_instances']} instâncias)")

def run_all_tests():
    """Executa todos os testes"""
    print("Executando testes...\n")
    
    try:
        test_health()
        test_aws_connection()
        test_ec2_list()
        print("\n✓ Todos os testes passaram!")
        return 0
    except Exception as e:
        print(f"\n✗ Teste falhou: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(run_all_tests())
```

## 📊 Integração com Ferramentas

### Postman Collection (JSON)

```json
{
  "info": {
    "name": "Cloud Hub Manager",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Health Check",
      "request": {
        "method": "GET",
        "header": [],
        "url": {
          "raw": "http://localhost:8000/health",
          "protocol": "http",
          "host": ["localhost"],
          "port": "8000",
          "path": ["health"]
        }
      }
    },
    {
      "name": "Test AWS Connection",
      "request": {
        "method": "GET",
        "header": [],
        "url": {
          "raw": "http://localhost:8000/api/v1/aws/test-connection",
          "protocol": "http",
          "host": ["localhost"],
          "port": "8000",
          "path": ["api", "v1", "aws", "test-connection"]
        }
      }
    },
    {
      "name": "List EC2 Instances",
      "request": {
        "method": "GET",
        "header": [],
        "url": {
          "raw": "http://localhost:8000/api/v1/aws/ec2/instances",
          "protocol": "http",
          "host": ["localhost"],
          "port": "8000",
          "path": ["api", "v1", "aws", "ec2", "instances"]
        }
      }
    }
  ]
}
```

---

## 💡 Dicas

1. **Use a documentação interativa**: http://localhost:8000/docs
2. **Habilite logs detalhados** adicionando `LOG_LEVEL=DEBUG` no `.env`
3. **Use jq** para formatar JSON no terminal: `curl ... | jq`
4. **Salve responses** para debug: `curl ... > response.json`

## 🔗 Recursos Adicionais

- Documentação FastAPI: https://fastapi.tiangolo.com
- Boto3 Docs: https://boto3.amazonaws.com/v1/documentation/api/latest/index.html
- Requests Docs: https://requests.readthedocs.io
