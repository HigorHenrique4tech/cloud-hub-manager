# Plano de Implementação — Novos Scanners FinOps

> **Arquivo central:** `backend/app/services/finops_service.py`
> **9 novos métodos** + **2 helpers privados** + **3 `scan_all()` atualizados**
> **Sem migração de banco necessária** · **Sem novos pacotes pip**

---

## Ordem de Implementação

### Etapa 0 — Helpers compartilhados (pré-requisito)

| Helper | Classe | O que faz |
|--------|--------|-----------|
| `_cloudwatch_sum(namespace, metric, dimensions, days)` | `AWSFinOpsScanner` | Igual ao `_cloudwatch_avg()` mas usa `Statistics=["Sum"]` e retorna soma total. Usado por S3 e LB. |
| `_azure_monitor_sum(resource_id, metric, days)` | `AzureFinOpsScanner` | Igual ao `_azure_monitor_avg()` mas `aggregation="Total"`. Retorna soma. Usado por Blob e LB. |

### Etapa 1 — Load Balancers sem tráfego (maior $ por unidade, lógica mais simples)

### Etapa 2 — Storage buckets sem acesso

### Etapa 3 — Reserved Instance / Committed Use Discount Advisor

---

## Constantes a Adicionar (topo de `finops_service.py`)

```python
# Storage
S3_PRICE_PER_GB          = 0.023   # Standard storage $/GB/mês
GCS_PRICE_PER_GB         = 0.020   # Standard storage $/GB/mês
AZURE_BLOB_PRICE_PER_GB  = 0.018   # LRS $/GB/mês
STORAGE_INACTIVE_DAYS    = 30      # dias sem requests = inativo
BUCKET_MIN_COST          = 1.0     # ignorar buckets com custo < $1/mês

# Load Balancers (custo mensal base estimado)
AWS_ALB_MONTHLY_COST      = 18.00
AWS_NLB_MONTHLY_COST      = 16.00
AZURE_STD_LB_MONTHLY_COST = 18.25
AZURE_APP_GW_MONTHLY_COST = 140.00
GCP_LB_MONTHLY_COST       = 18.25
LB_TRAFFIC_WINDOW_DAYS    = 7

# Reserved Instances / CUD
AWS_RI_SAVING_PCT   = 0.40   # fallback se CE API falhar
AZURE_RI_SAVING_PCT = 0.40
GCP_CUD_SAVING_PCT  = 0.37
RI_CPU_THRESHOLD    = 70.0   # % CPU médio acima disso = candidato a RI
RI_MIN_SAVING       = 5.0    # ignorar recomendações < $5/mês
```

---

## Feature 3: Load Balancers sem tráfego

### AWS — `AWSFinOpsScanner.scan_lb_unused()`

**API:** `elbv2.describe_load_balancers()` + CloudWatch `RequestCount` (7 dias)

**Lógica:**
1. `elbv2 = self._client("elbv2")`
2. Paginar `describe_load_balancers()`. Filtrar `State.Code == "active"`.
3. Para cada LB, chamar `_cloudwatch_sum()`:
   - ALB: `Namespace="AWS/ApplicationELB"`, `MetricName="RequestCount"`, dimensão `LoadBalancer=<arn_suffix>`
   - NLB: `Namespace="AWS/NetworkELB"`, mesma métrica
   - O sufixo do ARN é tudo após `"loadbalancer/"` no ARN completo
4. Se soma == 0 em 7 dias → flag
5. Custo estimado: ALB=$18/mês, NLB=$16/mês, GLB=$22/mês (pelo campo `Type`)

**Finding dict:**
```python
{
    "provider": "aws",
    "resource_id": lb["LoadBalancerArn"],
    "resource_name": lb["LoadBalancerName"],
    "resource_type": "load_balancer",
    "region": self.region,
    "recommendation_type": "delete",
    "severity": _severity(cost),
    "estimated_saving_monthly": cost,
    "current_monthly_cost": cost,
    "reasoning": f"ALB '{name}' sem tráfego nos últimos {LB_TRAFFIC_WINDOW_DAYS} dias. Custo fixo estimado: ${cost}/mês.",
    "current_spec": {"lb_type": lb["Type"], "scheme": lb["Scheme"], "dns_name": lb["DNSName"]},
    "recommended_spec": None,
}
```

**IAM nova:** `elasticloadbalancing:DescribeLoadBalancers` ⚠️

**Rate limit:** Paginação nativa; cap em 100 LBs; `try/except ClientError` por LB.

---

### Azure — `AzureFinOpsScanner.scan_lb_unused()`

**API:** `network.load_balancers.list_all()` + `network.application_gateways.list_all()` + Monitor `ByteCount`/`TotalRequests` (7 dias)

**Lógica:**
1. **Load Balancers Standard:**
   - `network = self._network()`
   - Para cada `lb` com `lb.sku.name == "Standard"` (Basic LB é gratuito — ignorar)
   - `_azure_monitor_sum(lb.id, "ByteCount", days=7)`
   - Se None ou 0 → flag com custo $18.25/mês
2. **Application Gateways:**
   - `for ag in network.application_gateways.list_all()`
   - `_azure_monitor_sum(ag.id, "TotalRequests", days=7)`
   - Se None ou 0 → flag com custo $140/mês

**Finding dict (LB):**
```python
{
    "provider": "azure",
    "resource_id": lb.id,
    "resource_name": lb.name,
    "resource_type": "load_balancer",
    "region": lb.location,
    "recommendation_type": "delete",
    "severity": _severity(cost),
    "estimated_saving_monthly": cost,
    "current_monthly_cost": cost,
    "reasoning": f"Load Balancer '{lb.name}' (SKU Standard) sem ByteCount nos últimos {LB_TRAFFIC_WINDOW_DAYS} dias.",
    "current_spec": {"sku": lb.sku.name, "resource_group": rg},
    "recommended_spec": None,
}
```

**RBAC:** Reader role cobre tudo (já existente). Sem permissão nova.

---

### GCP — `GCPFinOpsScanner.scan_lb_unused()`

**API:** `compute_v1.GlobalForwardingRulesClient` + Cloud Monitoring `loadbalancing.googleapis.com/https/request_count` (7 dias)

**Lógica:**
1. `from google.cloud import compute_v1`
2. `fr_client = compute_v1.GlobalForwardingRulesClient(credentials=self.credentials)`
3. `for rule in fr_client.list(project=self.project_id)`
4. Filtrar: `rule.load_balancing_scheme in ("EXTERNAL", "EXTERNAL_MANAGED")`
5. Consultar Monitoring com filtro `resource.labels.forwarding_rule_name="{rule.name}"`, métrica `loadbalancing.googleapis.com/https/request_count`, agregador `Sum`, 7 dias
6. Se total == 0 → flag com custo $18.25/mês
7. Também iterar `compute_v1.ForwardingRulesClient().aggregated_list()` para LBs regionais

**Finding dict:**
```python
{
    "provider": "gcp",
    "resource_id": rule.name,
    "resource_name": rule.name,
    "resource_type": "load_balancer",
    "region": rule.region or "global",
    "recommendation_type": "delete",
    "severity": _severity(GCP_LB_MONTHLY_COST),
    "estimated_saving_monthly": GCP_LB_MONTHLY_COST,
    "current_monthly_cost": GCP_LB_MONTHLY_COST,
    "reasoning": f"Forwarding rule '{rule.name}' sem requisições nos últimos {LB_TRAFFIC_WINDOW_DAYS} dias.",
    "current_spec": {"ip_address": rule.ip_address, "port_range": rule.port_range, "scheme": rule.load_balancing_scheme},
    "recommended_spec": None,
}
```

**IAM nova:** `compute.globalForwardingRules.list`, `compute.forwardingRules.list` ⚠️

**Rate limit:** Cap em 100 forwarding rules.

---

## Feature 2: Storage Buckets sem Acesso

### AWS — `AWSFinOpsScanner.scan_s3_unused()`

**API:** `s3.list_buckets()` + CloudWatch `GetRequests` + `PutRequests` (30 dias) + `BucketSizeBytes`

**Lógica:**
1. `s3 = self._client("s3")`
2. `for bucket in s3.list_buckets()["Buckets"]`
3. Dimensões para CloudWatch: `[{"Name": "BucketName", "Value": name}, {"Name": "StorageType", "Value": "StandardStorage"}]`
4. `size_bytes = _cloudwatch_avg(...)` com `BucketSizeBytes`
5. `get_requests = _cloudwatch_sum(...)` com `GetRequests`
6. `put_requests = _cloudwatch_sum(...)` com `PutRequests`
7. `cost = (size_bytes or 0) / (1024**3) * S3_PRICE_PER_GB`
8. Se `cost < BUCKET_MIN_COST` → skip (evita ruído de buckets vazios)
9. Se `(get_requests or 0) + (put_requests or 0) == 0` → flag

> ⚠️ **Nota técnica:** Métricas de request (`GetRequests`, `PutRequests`) só existem no CloudWatch se o bucket tiver "request metrics" habilitado (não é padrão). Usar `try/except` — se métrica não existir, flagar apenas pelo tamanho + data de criação (`CreationDate` > 90 dias).

**Finding dict:**
```python
{
    "provider": "aws",
    "resource_id": bucket_name,
    "resource_name": bucket_name,
    "resource_type": "s3_bucket",
    "region": self.region,
    "recommendation_type": "delete",
    "severity": _severity(cost),
    "estimated_saving_monthly": cost,
    "current_monthly_cost": cost,
    "reasoning": f"Bucket S3 '{name}' de {size_gb:.1f} GB sem GET/PUT requests nos últimos {STORAGE_INACTIVE_DAYS} dias.",
    "current_spec": {"size_gb": size_gb, "creation_date": str(bucket["CreationDate"])},
    "recommended_spec": {"action": "Aplicar lifecycle policy ou deletar"},
}
```

**IAM nova:** `s3:ListAllMyBuckets` ⚠️ (já incluso em muitas políticas, mas deve ser documentado)

**Rate limit:** Cap em 200 buckets; `try/except ClientError` por bucket.

---

### Azure — `AzureFinOpsScanner.scan_blob_unused()`

**API:** `StorageManagementClient.storage_accounts.list()` + Monitor `Transactions` + `UsedCapacity` (30 dias)

**Lógica:**
1. `from azure.mgmt.storage import StorageManagementClient`
2. `storage_client = StorageManagementClient(self._get_credential(), self.subscription_id)`
3. `for account in storage_client.storage_accounts.list()`
4. `transactions = _azure_monitor_sum(account.id, "Transactions", days=30)`
5. `used_bytes = _azure_monitor_avg(account.id, "UsedCapacity", days=30)` (bytes)
6. `cost = (used_bytes or 0) / (1024**3) * AZURE_BLOB_PRICE_PER_GB`
7. Se `cost < BUCKET_MIN_COST` → skip
8. Se `transactions == 0` ou `transactions is None` → flag

**Finding dict:**
```python
{
    "provider": "azure",
    "resource_id": account.id,
    "resource_name": account.name,
    "resource_type": "storage_account",
    "region": account.location,
    "recommendation_type": "delete",
    "severity": _severity(cost),
    "estimated_saving_monthly": cost,
    "current_monthly_cost": cost,
    "reasoning": f"Storage Account '{account.name}' sem transações nos últimos {STORAGE_INACTIVE_DAYS} dias.",
    "current_spec": {"sku": account.sku.name, "kind": account.kind, "size_gb": size_gb},
    "recommended_spec": None,
}
```

**RBAC:** Reader role cobre `Microsoft.Storage/storageAccounts/read` + `Microsoft.Insights/metrics/read`. Sem permissão nova.

---

### GCP — `GCPFinOpsScanner.scan_gcs_unused()`

**API:** `google.cloud.storage.Client.list_buckets()` + Cloud Monitoring `storage.googleapis.com/storage/total_bytes` (30 dias)

**Lógica:**
1. `from google.cloud import storage as gcs`
2. `client = gcs.Client(credentials=self.credentials, project=self.project_id)`
3. `for bucket in client.list_buckets()`
4. Consultar Monitoring: `storage.googleapis.com/storage/total_bytes` com filtro `resource.labels.bucket_name="{bucket.name}"`, agregador `Mean`, 30 dias → `size_bytes`
5. `cost = (size_bytes or 0) / (1024**3) * GCS_PRICE_PER_GB`
6. Se `cost < BUCKET_MIN_COST` → skip
7. Verificar atividade: `bucket.updated` (timestamp de última modificação). Se `updated < (now - 90 days)` → flag

**Finding dict:**
```python
{
    "provider": "gcp",
    "resource_id": bucket.name,
    "resource_name": bucket.name,
    "resource_type": "gcs_bucket",
    "region": bucket.location.lower(),
    "recommendation_type": "delete",
    "severity": _severity(cost),
    "estimated_saving_monthly": cost,
    "current_monthly_cost": cost,
    "reasoning": f"Bucket GCS '{bucket.name}' de {size_gb:.1f} GB sem modificações há mais de 90 dias.",
    "current_spec": {"location": bucket.location, "storage_class": bucket.storage_class, "size_gb": size_gb},
    "recommended_spec": {"action": "Mudar para Coldline/Archive ou deletar"},
}
```

**IAM:** `storage.buckets.list` + `monitoring.timeSeries.list` — já existentes. Sem permissão nova.

**Rate limit:** Cap em 200 buckets.

---

## Feature 1: Reserved Instance / Committed Use Discount Advisor

### AWS — `AWSFinOpsScanner.scan_ri_advisor()`

**API:** `ce.get_reservation_purchase_recommendation()` — AWS já pré-computa as recomendações de RI nativamente.

**Lógica:**
1. `ce = self._client("ce", region_name="us-east-1")`
2. Chamar:
   ```python
   ce.get_reservation_purchase_recommendation(
       Service="Amazon EC2",
       LookbackPeriodInDays=30,
       TermInYears="ONE_YEAR",
       PaymentOption="NO_UPFRONT"
   )
   ```
3. Para cada `recommendation` em `resp["Recommendations"]`:
   - `saving = float(rec["EstimatedMonthlySavingsAmount"])`
   - Se `saving < RI_MIN_SAVING` → skip
   - Extrair `InstanceDetails.EC2InstanceDetails`: `instance_type`, `region`, `platform`, `quantity`
4. `resource_id = f"ri-ec2-{instance_type}-{region}"` (chave estável para dedup)

**Finding dict:**
```python
{
    "provider": "aws",
    "resource_id": f"ri-ec2-{instance_type}-{region}",
    "resource_name": f"{quantity}x {instance_type} ({region})",
    "resource_type": "ec2_fleet",
    "region": region,
    "recommendation_type": "reserve",
    "severity": _severity(saving),
    "estimated_saving_monthly": saving,
    "current_monthly_cost": float(rec["EstimatedMonthlyOnDemandCost"]),
    "reasoning": f"Comprar {quantity}x Reserved Instance {instance_type} (1 ano, No Upfront) economiza ${saving:.2f}/mês vs On-Demand.",
    "current_spec": {"instance_type": instance_type, "region": region, "platform": platform, "quantity": quantity},
    "recommended_spec": {"term": "1_year", "payment_option": "no_upfront", "quantity": quantity, "break_even_months": rec.get("RecurringStandardMonthlyCost")},
}
```

**IAM nova:** `ce:GetReservationPurchaseRecommendation` ⚠️

**Rate limit:** CE é pré-computado, responde em <3s. Chamada única. Sem risco.

---

### Azure — `AzureFinOpsScanner.scan_ri_advisor()`

**Estratégia:** VMs com CPU médio >70% nos últimos 30 dias = candidatas a Azure Reservations (~40% de desconto no custo compute).

**Lógica:**
1. Reutilizar `self._compute().virtual_machines.list_all()`
2. Para cada VM em estado `running`:
   - `avg_cpu = _azure_monitor_avg(resource_id, "Percentage CPU", days=30)`
   - Se `avg_cpu is None` ou `avg_cpu < RI_CPU_THRESHOLD` → skip
   - `current_cost = _estimate_vm_monthly_cost(vm_size)`
   - `saving = round(current_cost * AZURE_RI_SAVING_PCT, 2)`
   - Se `saving < RI_MIN_SAVING` → skip
3. `resource_id = vm.id` (único, deduplicado automaticamente)

**Finding dict:**
```python
{
    "provider": "azure",
    "resource_id": vm.id,
    "resource_name": vm.name,
    "resource_type": "vm",
    "region": vm.location,
    "recommendation_type": "reserve",
    "severity": _severity(saving),
    "estimated_saving_monthly": saving,
    "current_monthly_cost": current_cost,
    "reasoning": f"VM '{vm.name}' com CPU médio de {avg_cpu:.1f}% em 30 dias. Azure Reservation (1 ano) economiza ~40% = ${saving:.2f}/mês.",
    "current_spec": {"vm_size": vm_size, "resource_group": rg, "avg_cpu_30d": round(avg_cpu, 1)},
    "recommended_spec": {"commitment_type": "azure_reservation_1yr", "discount_pct": 40},
}
```

**RBAC:** Reader role (já existente). Sem permissão nova.

---

### GCP — `GCPFinOpsScanner.scan_cud_advisor()`

**Estratégia:** GCE instances com CPU médio >70% nos últimos 30 dias = candidatas a Committed Use Discounts (~37% de desconto).

**Lógica:**
1. Reutilizar `_instances_client().aggregated_list(project=self.project_id)`
2. Para cada instância `RUNNING`:
   - `avg_cpu = _get_instance_avg_cpu(str(inst.id))` (já usa 7 dias; modificar para 30 dias)
   - Se `avg_cpu is None` ou `avg_cpu < RI_CPU_THRESHOLD` → skip
   - `current_cost = _estimate_gce_monthly_cost(machine_type)`
   - `saving = round(current_cost * GCP_CUD_SAVING_PCT, 2)`
   - Se `saving < RI_MIN_SAVING` → skip

**Finding dict:**
```python
{
    "provider": "gcp",
    "resource_id": inst.name,
    "resource_name": inst.name,
    "resource_type": "compute_instance",
    "region": zone,
    "recommendation_type": "reserve",
    "severity": _severity(saving),
    "estimated_saving_monthly": saving,
    "current_monthly_cost": current_cost,
    "reasoning": f"GCE '{inst.name}' com CPU médio de {avg_cpu:.1f}% em 30 dias. CUD 1 ano economiza ~37% = ${saving:.2f}/mês.",
    "current_spec": {"machine_type": machine_type, "zone": zone, "avg_cpu_30d": round(avg_cpu, 1)},
    "recommended_spec": {"commitment_type": "cud_1yr", "discount_pct": 37},
}
```

**IAM:** Já existente (`compute.instances.list`, `monitoring.timeSeries.list`). Sem permissão nova.

**Rate limit:** Mesmo padrão de `scan_gce_rightsizing()` — `try/except` por instância.

---

## Atualização de `scan_all()` (por classe)

### `AWSFinOpsScanner.scan_all()`
```python
findings.extend(self.scan_lb_unused())    # Feature 3 — novo
findings.extend(self.scan_s3_unused())    # Feature 2 — novo
findings.extend(self.scan_ri_advisor())   # Feature 1 — novo
```

### `AzureFinOpsScanner.scan_all()`
```python
findings.extend(self.scan_lb_unused())    # Feature 3 — novo
findings.extend(self.scan_blob_unused())  # Feature 2 — novo
findings.extend(self.scan_ri_advisor())   # Feature 1 — novo
```

### `GCPFinOpsScanner.scan_all()`
```python
findings.extend(self.scan_lb_unused())    # Feature 3 — novo
findings.extend(self.scan_gcs_unused())   # Feature 2 — novo
findings.extend(self.scan_cud_advisor())  # Feature 1 — novo
```

---

## Permissões IAM/RBAC Necessárias

| Feature | Provider | Permissão | Status |
|---------|----------|-----------|--------|
| RI Advisor | AWS | `ce:GetReservationPurchaseRecommendation` | ⚠️ NOVA |
| Storage | AWS | `s3:ListAllMyBuckets` | ⚠️ NOVA (frequentemente inclusa em políticas) |
| Load Balancer | AWS | `elasticloadbalancing:DescribeLoadBalancers` | ⚠️ NOVA |
| Load Balancer | GCP | `compute.globalForwardingRules.list`, `compute.forwardingRules.list` | ⚠️ NOVA |
| RI Advisor | Azure | — | ✅ Reader role existente |
| Storage | Azure | — | ✅ Reader role existente |
| Load Balancer | Azure | — | ✅ Reader role existente |
| RI Advisor | GCP | — | ✅ Permissões existentes |
| Storage | GCP | — | ✅ Permissões existentes |

---

## Frontend — Atualizar Labels (`utils/finops-constants.js`)

Adicionar mapeamentos para os novos tipos que aparecerão nas recomendações:

```js
// recommendation_type labels
"reserve": { label: "Instância Reservada", icon: Zap }

// resource_type labels (para display no card)
"s3_bucket":           "S3 Bucket",
"gcs_bucket":          "GCS Bucket",
"storage_account":     "Storage Account",
"load_balancer":       "Load Balancer",
"application_gateway": "Application Gateway",
"ec2_fleet":           "Frota EC2",
```

O botão "Aplicar" **não** deve aparecer para `recommendation_type === "reserve"` — RI é uma decisão financeira manual. O card exibirá a economia mas sem ação automatizada. Verificar `RecommendationCard.jsx` linha onde `canApply` é calculado e excluir `reserve`.

---

## Impacto e Riscos

| Scanner | Risco de performance | Mitigação |
|---------|---------------------|-----------|
| `scan_s3_unused` | 1 CW call/bucket — lento com 1000+ buckets | Cap em 200 buckets |
| `scan_lb_unused` (AWS) | Paginação + 1 CW call/LB | Cap em 100 LBs |
| `scan_ri_advisor` (AWS) | CE pré-computado, <3s | Nenhuma |
| `scan_blob_unused` | Monitor por storage account | `try/except` por conta |
| `scan_lb_unused` (Azure) | Monitor por LB + App GW | `try/except` por recurso |
| `scan_gcs_unused` | Monitoring por bucket | Cap em 200 buckets |
| `scan_lb_unused` (GCP) | Monitoring por forwarding rule | Cap em 100 rules |
| `scan_cud_advisor` (GCP) | 1 Monitoring call/instância | Usa `_get_instance_avg_cpu()` existente com `try/except` |

Todos os scans rodam em `threading.Thread` background com TTL de 3600s — sem risco de timeout HTTP.

---

## Banco de Dados

**Sem migração necessária.** `recommendation_type` é `String(50)` sem ENUM. `resource_type` também. Os novos valores (`"reserve"`, `"s3_bucket"`, `"load_balancer"`, etc.) cabem diretamente.

---

*Última atualização: 2026-03-09*
