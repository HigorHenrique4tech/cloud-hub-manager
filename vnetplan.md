# Implementação de 3 Features para VNets

Adicionar ao módulo Azure de Virtual Networks 3 novas funcionalidades: **Gerenciamento de Subnets**, **VNet Peering**, e **Diagrama de Topologia de Rede**. Atualmente a aba de VNets suporta listar, criar, excluir e ver detalhes (drawer). Estas features a expandem para suportar operações de rede avançadas.

---

## Proposed Changes

### Feature 1 — Gerenciamento de Subnets

Permite adicionar, editar e excluir subnets em VNets já existentes (hoje só é possível gerenciar subnets no momento da criação).

---

#### [MODIFY] azure_service.py

Adicionar 3 métodos na seção de VNets:

- **`create_subnet(resource_group, vnet_name, subnet_name, address_prefix, nsg_id=None)`** — Usa `network_client.subnets.begin_create_or_update()`. Retorna `{success, name, id}`.
- **`update_subnet(resource_group, vnet_name, subnet_name, address_prefix, nsg_id=None)`** — Mesma API do create (create_or_update), permite alterar o CIDR e associar/desassociar NSG.
- **`delete_subnet(resource_group, vnet_name, subnet_name)`** — Usa `network_client.subnets.begin_delete()`. Retorna `{success}`.

Também enriquecer o `get_vnet_detail` já existente para retornar mais dados de cada subnet:
- `nsg_name` (Network Security Group associado)
- `route_table_name` (Route Table associada)
- `connected_devices_count` (quantos IPs estão alocados)
- `delegation` (se a subnet é delegada a algum serviço)

---

#### [MODIFY] create_schemas.py

Adicionar schemas:

```python
class CreateSubnetRequest(BaseModel):
    subnet_name: str
    address_prefix: str
    nsg_id: Optional[str] = None

class UpdateSubnetRequest(BaseModel):
    address_prefix: str
    nsg_id: Optional[str] = None
```

---

#### [MODIFY] azure.py (API)

Novos endpoints na seção de VNets:

| Método | Rota | Handler |
|--------|------|---------|
| `POST` | `/vnets/{rg}/{vnet_name}/subnets` | `ws_create_subnet` |
| `PUT` | `/vnets/{rg}/{vnet_name}/subnets/{subnet_name}` | `ws_update_subnet` |
| `DELETE` | `/vnets/{rg}/{vnet_name}/subnets/{subnet_name}` | `ws_delete_subnet` |

Todos seguem o padrão existente: permission gate, log_activity, cache_delete.

---

#### [MODIFY] azureservices.js

Adicionar na seção "Virtual Networks":

```js
createSubnet: async (rg, vnetName, data) => (await api.post(wsUrl(`/azure/vnets/${rg}/${vnetName}/subnets`), data)).data,
updateSubnet: async (rg, vnetName, subnetName, data) => (await api.put(wsUrl(`/azure/vnets/${rg}/${vnetName}/subnets/${subnetName}`), data)).data,
deleteSubnet: async (rg, vnetName, subnetName) => (await api.delete(wsUrl(`/azure/vnets/${rg}/${vnetName}/subnets/${subnetName}`))).data,
```

---

#### [MODIFY] AzureVNets.jsx

Enriquecer a seção "Subnets" no `ResourceDetailDrawer` para permitir:
- **Adicionar subnet** — botão "+" abre inline form com nome + CIDR
- **Excluir subnet** — ícone de lixeira ao lado de cada subnet
- Exibir informações extras do subnet (NSG, delegação, IPs alocados)

---

### Feature 2 — VNet Peering

Permite criar, visualizar e excluir peerings entre VNets. Essencial para ambientes multi-VNet.

---

#### [MODIFY] azure_service.py

Adicionar métodos:

- **`list_vnet_peerings(resource_group, vnet_name)`** — Usa `network_client.virtual_network_peerings.list()`. Retorna lista com `{name, peering_state, remote_vnet_id, allow_forwarded_traffic, allow_gateway_transit, use_remote_gateways}`.
- **`create_vnet_peering(resource_group, vnet_name, peering_name, remote_vnet_id, allow_forwarded_traffic, allow_gateway_transit, use_remote_gateways)`** — Usa `network_client.virtual_network_peerings.begin_create_or_update()`.
- **`delete_vnet_peering(resource_group, vnet_name, peering_name)`** — Usa `network_client.virtual_network_peerings.begin_delete()`.

Enriquecer o `get_vnet_detail` existente para retornar a lista completa de peerings (não apenas o count).

---

#### [MODIFY] create_schemas.py

```python
class CreateVNetPeeringRequest(BaseModel):
    peering_name: str
    remote_vnet_id: str
    allow_forwarded_traffic: bool = True
    allow_gateway_transit: bool = False
    use_remote_gateways: bool = False
```

---

#### [MODIFY] azure.py (API)

| Método | Rota | Handler |
|--------|------|---------|
| `GET` | `/vnets/{rg}/{vnet_name}/peerings` | `ws_list_vnet_peerings` |
| `POST` | `/vnets/{rg}/{vnet_name}/peerings` | `ws_create_vnet_peering` |
| `DELETE` | `/vnets/{rg}/{vnet_name}/peerings/{peering_name}` | `ws_delete_vnet_peering` |

---

#### [MODIFY] azureservices.js

```js
listVNetPeerings: async (rg, vnetName) => (await api.get(wsUrl(`/azure/vnets/${rg}/${vnetName}/peerings`))).data,
createVNetPeering: async (rg, vnetName, data) => (await api.post(wsUrl(`/azure/vnets/${rg}/${vnetName}/peerings`), data)).data,
deleteVNetPeering: async (rg, vnetName, peeringName) => (await api.delete(wsUrl(`/azure/vnets/${rg}/${vnetName}/peerings/${peeringName}`))).data,
```

---

#### [MODIFY] AzureVNets.jsx

Adicionar seção "Peerings" no `ResourceDetailDrawer`:
- Tabela com peerings existentes (nome, VNet remota, estado, opções)
- Botão "Criar Peering" que abre modal com:
  - Nome do peering
  - Dropdown com VNets disponíveis (da lista já carregada)
  - Toggles para `allow_forwarded_traffic`, `allow_gateway_transit`, `use_remote_gateways`
- Ícone de excluir em cada peering

---

### Feature 3 — Diagrama de Topologia de Rede

Visualização interativa tipo mapa mostrando VNets, subnets e peerings como grafo.

---

#### [MODIFY] azure_service.py

Adicionar método:

- **`get_network_topology()`** — Coleta todas as VNets com seus subnets e peerings e retorna um payload já estruturado com `nodes[]` e `edges[]` prontos para renderização:
  - Cada VNet = node tipo "vnet" com subnets como children
  - Cada peering = edge entre dois nodes

---

#### [MODIFY] azure.py (API)

| Método | Rota | Handler |
|--------|------|---------|
| `GET` | `/vnets/topology` | `ws_get_network_topology` |

---

#### [MODIFY] azureservices.js

```js
getNetworkTopology: async () => (await api.get(wsUrl('/azure/vnets/topology'))).data,
```

---

#### [NEW] NetworkTopologyDiagram.jsx

Componente React usando **`@xyflow/react`** (React Flow) para renderizar o diagrama interativo:
- **VNet nodes**: caixas grandes com ícone de rede, nome, localização e CIDR
- **Subnet nodes**: caixas menores dentro da VNet, mostrando nome e CIDR
- **Peering edges**: linhas tracejadas conectando VNets com label de estado
- Controles de zoom, pan, minimap e auto-layout usando o algoritmo dagre
- Estilização dark/light mode consistente com o restante da plataforma

> **Nota**: Será necessário instalar `@xyflow/react` e `dagre` no frontend.

---

#### [MODIFY] AzureVNets.jsx

Adicionar um toggle **Lista / Topologia** acima da tabela para alternar entre a tabela atual e o componente `NetworkTopologyDiagram`.

---

## Verification Plan

### Testes Automatizados Existentes

O backend possui testes em `backend/tests/`. O comando para rodar:

```bash
cd backend && python -m pytest tests/ -v
```

Após a implementação, os testes existentes devem continuar passando (sem regressões).

### Teste Manual (requer usuário com credenciais Azure)

> **IMPORTANTE**: Estes testes exigem que a pessoa tenha credenciais Azure configuradas no workspace para que os endpoints funcionem. Sem credenciais, retornarão erro 400.

1. **Subnets**: Abrir drawer de uma VNet → clicar "Adicionar Subnet" → preencher nome e CIDR → confirmar → verificar que a subnet aparece na lista. Depois clicar no ícone de excluir → confirmar → verificar que sumiu.

2. **Peering**: Abrir drawer de uma VNet → ir na seção Peerings → clicar "Criar Peering" → selecionar VNet remota → confirmar → verificar que o peering apareceu como "Initiated". Excluir peering → confirmar.

3. **Topologia**: Na página de VNets → clicar no toggle "Topologia" → verificar que o diagrama aparece com os nós representando as VNets e subnets, e que os peerings são representados por arestas. Testar zoom, pan e minimap.
