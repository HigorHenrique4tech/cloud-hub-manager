import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Network, Plus, Trash2, Edit3, Link2, Unlink, Shield, Route, Monitor, ChevronDown, ChevronUp } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useBackgroundTasks } from '../../contexts/BackgroundTasksContext';
import { useToast } from '../../contexts/ToastContext';
import Layout from '../../components/layout/layout';
import LoadingSpinner from '../../components/common/loadingspinner';
import NoCredentialsMessage from '../../components/common/NoCredentialsMessage';
import CreateResourceModal from '../../components/common/CreateResourceModal';
import ConfirmDeleteModal from '../../components/common/ConfirmDeleteModal';
import CreateAzureVNetForm from '../../components/create/CreateAzureVNetForm';
import PermissionGate from '../../components/common/PermissionGate';
import useCreateResource from '../../hooks/useCreateResource';
import azureService from '../../services/azureservices';
import TemplateBar from '../../components/common/TemplateBar';
import ResourceDetailDrawer from '../../components/common/ResourceDetailDrawer';

const defaultForm = { name: '', resource_group: '', location: '', address_prefixes: ['10.0.0.0/16'], subnets: [], tags: {}, tags_list: [] };

// ── Subnet inline form ──────────────────────────────────────────────────────
const SubnetForm = ({ onSubmit, onCancel, initial, isLoading }) => {
  const [name, setName] = useState(initial?.name || '');
  const [cidr, setCidr] = useState(initial?.address_prefix || '');
  const isEdit = !!initial?.name;

  return (
    <div className="flex items-end gap-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
      {!isEdit && (
        <div className="flex-1 min-w-0">
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Nome</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex: frontend-subnet"
            className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-sky-500 focus:border-transparent"
          />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">CIDR</label>
        <input
          value={cidr}
          onChange={(e) => setCidr(e.target.value)}
          placeholder="10.0.1.0/24"
          className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-sky-500 focus:border-transparent font-mono"
        />
      </div>
      <button
        onClick={() => onSubmit({ subnet_name: name, address_prefix: cidr })}
        disabled={isLoading || (!isEdit && !name.trim()) || !cidr.trim()}
        className="px-3 py-1.5 text-sm bg-sky-600 text-white rounded-md hover:bg-sky-700 disabled:opacity-50 whitespace-nowrap"
      >
        {isLoading ? '...' : isEdit ? 'Salvar' : 'Adicionar'}
      </button>
      <button
        onClick={onCancel}
        className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
      >
        Cancelar
      </button>
    </div>
  );
};

// ── Peering modal ───────────────────────────────────────────────────────────
const PeeringModal = ({ isOpen, onClose, onSubmit, vnets, currentVnet, isLoading }) => {
  const [peeringName, setPeeringName] = useState('');
  const [remoteVnetId, setRemoteVnetId] = useState('');
  const [allowForwarded, setAllowForwarded] = useState(true);
  const [allowGateway, setAllowGateway] = useState(false);
  const [useRemoteGw, setUseRemoteGw] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPeeringName('');
      setRemoteVnetId('');
      setAllowForwarded(true);
      setAllowGateway(false);
      setUseRemoteGw(false);
    }
  }, [isOpen]);

  const availableVnets = vnets.filter(v => v.name !== currentVnet?.name);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Criar VNet Peering</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome do Peering</label>
            <input
              value={peeringName}
              onChange={(e) => setPeeringName(e.target.value)}
              placeholder="ex: vnet-hub-to-spoke"
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-sky-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">VNet Remota</label>
            <select
              value={remoteVnetId}
              onChange={(e) => setRemoteVnetId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-sky-500 focus:border-transparent"
            >
              <option value="">Selecionar VNet...</option>
              {availableVnets.map(v => (
                <option key={v.id} value={v.id}>{v.name} ({v.resource_group})</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={allowForwarded} onChange={(e) => setAllowForwarded(e.target.checked)}
                className="rounded border-gray-300 text-sky-600 focus:ring-sky-500" />
              <span className="text-sm text-gray-700 dark:text-gray-300">Permitir tráfego encaminhado</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={allowGateway} onChange={(e) => setAllowGateway(e.target.checked)}
                className="rounded border-gray-300 text-sky-600 focus:ring-sky-500" />
              <span className="text-sm text-gray-700 dark:text-gray-300">Permitir gateway transit</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={useRemoteGw} onChange={(e) => setUseRemoteGw(e.target.checked)}
                className="rounded border-gray-300 text-sky-600 focus:ring-sky-500" />
              <span className="text-sm text-gray-700 dark:text-gray-300">Usar gateways remotos</span>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200">
            Cancelar
          </button>
          <button
            onClick={() => onSubmit({
              peering_name: peeringName,
              remote_vnet_id: remoteVnetId,
              allow_forwarded_traffic: allowForwarded,
              allow_gateway_transit: allowGateway,
              use_remote_gateways: useRemoteGw,
            })}
            disabled={isLoading || !peeringName.trim() || !remoteVnetId}
            className="px-4 py-2 text-sm bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:opacity-50"
          >
            {isLoading ? 'Criando...' : 'Criar Peering'}
          </button>
        </div>
      </div>
    </div>
  );
};

const DEFAULT_NSG_RULE = {
  rule_name: '', priority: 1000, direction: 'Inbound', access: 'Allow',
  protocol: 'Tcp', source_address: '*', source_port: '*',
  dest_address: '*', dest_port: '80', description: '',
};

// ── Drawer extra content: Subnets + Peerings + NSG Rules ───────────────────
const VNetDrawerExtra = ({ detailTarget, vnets, onRefresh }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showSubnetForm, setShowSubnetForm] = useState(false);
  const [editingSubnet, setEditingSubnet] = useState(null);
  const [subnetLoading, setSubnetLoading] = useState(false);
  const [peeringModalOpen, setPeeringModalOpen] = useState(false);
  const [peeringLoading, setPeeringLoading] = useState(false);
  const [deletingSubnet, setDeletingSubnet] = useState(null);
  const [deletingPeering, setDeletingPeering] = useState(null);
  const [expandedSubnet, setExpandedSubnet] = useState(null);
  // NSG Rules state
  const [nsgRulesCache, setNsgRulesCache] = useState({});
  const [expandedNSG, setExpandedNSG] = useState(null);
  const [nsgActiveTab, setNsgActiveTab] = useState({});
  const [addingRuleFor, setAddingRuleFor] = useState(null);
  const [ruleForm, setRuleForm] = useState(DEFAULT_NSG_RULE);
  const [savingRule, setSavingRule] = useState(false);
  const [deletingRule, setDeletingRule] = useState(null);

  const rg = detailTarget?.resource_group;
  const vnetName = detailTarget?.name;

  const { data: detail } = useQuery({
    queryKey: ['azure-vnet-detail-extra', rg, vnetName],
    queryFn: () => azureService.getVNetDetail(rg, vnetName),
    enabled: !!rg && !!vnetName,
    staleTime: 15_000,
  });

  const refreshDetail = () => {
    queryClient.invalidateQueries({ queryKey: ['azure-vnet-detail-extra', rg, vnetName] });
    queryClient.invalidateQueries({ queryKey: ['azure-vnet-detail', rg, vnetName] });
    onRefresh();
  };

  const handleCreateSubnet = async (data) => {
    setSubnetLoading(true);
    try {
      const result = await azureService.createSubnet(rg, vnetName, data);
      if (result.success) {
        toast.success(`Subnet "${data.subnet_name}" criada com sucesso`);
        setShowSubnetForm(false);
        refreshDetail();
      } else {
        toast.error(result.error || 'Erro ao criar subnet');
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao criar subnet');
    } finally {
      setSubnetLoading(false);
    }
  };

  const handleUpdateSubnet = async (subnetName, data) => {
    setSubnetLoading(true);
    try {
      const result = await azureService.updateSubnet(rg, vnetName, subnetName, { address_prefix: data.address_prefix });
      if (result.success) {
        toast.success(`Subnet "${subnetName}" atualizada`);
        setEditingSubnet(null);
        refreshDetail();
      } else {
        toast.error(result.error || 'Erro ao atualizar subnet');
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao atualizar subnet');
    } finally {
      setSubnetLoading(false);
    }
  };

  const handleDeleteSubnet = async (subnetName) => {
    setDeletingSubnet(subnetName);
    try {
      const result = await azureService.deleteSubnet(rg, vnetName, subnetName);
      if (result.success) {
        toast.success(`Subnet "${subnetName}" excluída`);
        refreshDetail();
      } else {
        toast.error(result.error || 'Erro ao excluir subnet');
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao excluir subnet');
    } finally {
      setDeletingSubnet(null);
    }
  };

  const handleCreatePeering = async (data) => {
    setPeeringLoading(true);
    try {
      const result = await azureService.createVNetPeering(rg, vnetName, data);
      if (result.success) {
        toast.success(`Peering "${data.peering_name}" criado com sucesso`);
        setPeeringModalOpen(false);
        refreshDetail();
      } else {
        toast.error(result.error || 'Erro ao criar peering');
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao criar peering');
    } finally {
      setPeeringLoading(false);
    }
  };

  const handleDeletePeering = async (peeringName) => {
    setDeletingPeering(peeringName);
    try {
      const result = await azureService.deleteVNetPeering(rg, vnetName, peeringName);
      if (result.success) {
        toast.success(`Peering "${peeringName}" excluído`);
        refreshDetail();
      } else {
        toast.error(result.error || 'Erro ao excluir peering');
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao excluir peering');
    } finally {
      setDeletingPeering(null);
    }
  };

  const loadNSGRules = async (nsgName) => {
    setNsgRulesCache(prev => ({ ...prev, [nsgName]: { ...(prev[nsgName] || {}), loading: true } }));
    try {
      const result = await azureService.getNSGRules(rg, nsgName);
      setNsgRulesCache(prev => ({ ...prev, [nsgName]: { rules: result.rules || [], loading: false } }));
    } catch {
      setNsgRulesCache(prev => ({ ...prev, [nsgName]: { rules: [], loading: false, error: true } }));
      toast.error('Erro ao carregar regras do NSG');
    }
  };

  const handleToggleNSG = async (nsgName) => {
    if (expandedNSG === nsgName) { setExpandedNSG(null); return; }
    setExpandedNSG(nsgName);
    if (!nsgRulesCache[nsgName]?.rules) await loadNSGRules(nsgName);
  };

  const handleAddRule = async (nsgName) => {
    if (!ruleForm.rule_name.trim()) return;
    setSavingRule(true);
    try {
      const result = await azureService.addNSGRule(rg, nsgName, { ...ruleForm, priority: Number(ruleForm.priority) });
      if (result.success) {
        toast.success(`Regra "${ruleForm.rule_name}" criada`);
        setAddingRuleFor(null);
        setRuleForm(DEFAULT_NSG_RULE);
        await loadNSGRules(nsgName);
      } else {
        toast.error(result.error || 'Erro ao criar regra');
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao criar regra');
    } finally {
      setSavingRule(false);
    }
  };

  const handleDeleteRule = async (nsgName, ruleName) => {
    setDeletingRule(ruleName);
    try {
      const result = await azureService.deleteNSGRule(rg, nsgName, ruleName);
      if (result.success) {
        toast.success(`Regra "${ruleName}" excluída`);
        await loadNSGRules(nsgName);
      } else {
        toast.error(result.error || 'Erro ao excluir regra');
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao excluir regra');
    } finally {
      setDeletingRule(null);
    }
  };

  const subnets = detail?.subnets || [];
  const peerings = detail?.peerings || [];

  const peeringStateClass = (state) => {
    switch (state) {
      case 'Connected': return 'bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-100';
      case 'Initiated': return 'bg-blue-100 text-blue-700 dark:bg-blue-800 dark:text-blue-100';
      case 'Disconnected': return 'bg-red-100 text-red-700 dark:bg-red-800 dark:text-red-100';
      default: return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Subnets Section ─────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            Subnets ({subnets.length})
          </h3>
          <PermissionGate permission="resources.create">
            <button
              onClick={() => { setShowSubnetForm(true); setEditingSubnet(null); }}
              className="text-xs text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Adicionar
            </button>
          </PermissionGate>
        </div>

        {showSubnetForm && !editingSubnet && (
          <div className="mb-3">
            <SubnetForm
              onSubmit={handleCreateSubnet}
              onCancel={() => setShowSubnetForm(false)}
              isLoading={subnetLoading}
            />
          </div>
        )}

        {subnets.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">Nenhuma subnet</p>
        ) : (
          <div className="space-y-1">
            {subnets.map((s) => (
              <div key={s.name}>
                {editingSubnet === s.name ? (
                  <SubnetForm
                    initial={s}
                    onSubmit={(data) => handleUpdateSubnet(s.name, data)}
                    onCancel={() => setEditingSubnet(null)}
                    isLoading={subnetLoading}
                  />
                ) : (
                  <div className="group border border-gray-200 dark:border-gray-700 rounded-lg">
                    <div
                      className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      onClick={() => setExpandedSubnet(expandedSubnet === s.name ? null : s.name)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Network className="w-3.5 h-3.5 text-sky-500 flex-shrink-0" />
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{s.name}</span>
                        <span className="text-xs font-mono text-gray-500 dark:text-gray-400">{s.address_prefix}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <PermissionGate permission="resources.create">
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingSubnet(s.name); setShowSubnetForm(false); }}
                            className="p-1 text-gray-400 hover:text-sky-600 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Editar CIDR"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </PermissionGate>
                        <PermissionGate permission="resources.delete">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteSubnet(s.name); }}
                            disabled={deletingSubnet === s.name}
                            className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                            title="Excluir subnet"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </PermissionGate>
                        {expandedSubnet === s.name
                          ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                          : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                        }
                      </div>
                    </div>

                    {expandedSubnet === s.name && (
                      <div className="px-3 pb-2 pt-1 border-t border-gray-100 dark:border-gray-700/50 text-xs text-gray-500 dark:text-gray-400 space-y-1">
                        {s.nsg_name && (
                          <div className="flex items-center gap-1.5">
                            <Shield className="w-3 h-3" />
                            <span>NSG: {s.nsg_name}</span>
                          </div>
                        )}
                        {s.route_table_name && (
                          <div className="flex items-center gap-1.5">
                            <Route className="w-3 h-3" />
                            <span>Route Table: {s.route_table_name}</span>
                          </div>
                        )}
                        {s.delegation && (
                          <div className="flex items-center gap-1.5">
                            <Link2 className="w-3 h-3" />
                            <span>Delegação: {s.delegation}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <Monitor className="w-3 h-3" />
                          <span>Dispositivos conectados: {s.connected_devices_count ?? 0}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-block w-1.5 h-1.5 rounded-full ${s.provisioning_state === 'Succeeded' ? 'bg-green-500' : 'bg-yellow-500'}`} />
                          <span>Status: {s.provisioning_state}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Peerings Section ────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            Peerings ({peerings.length})
          </h3>
          <PermissionGate permission="resources.create">
            <button
              onClick={() => setPeeringModalOpen(true)}
              className="text-xs text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Criar Peering
            </button>
          </PermissionGate>
        </div>

        {peerings.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">Nenhum peering configurado</p>
        ) : (
          <div className="space-y-2">
            {peerings.map((p) => (
              <div key={p.name} className="group flex items-center justify-between border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link2 className="w-3.5 h-3.5 text-sky-500 flex-shrink-0" />
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{p.name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${peeringStateClass(p.peering_state)}`}>
                      {p.peering_state}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                    <span>→ {p.remote_vnet_name}</span>
                    {p.allow_forwarded_traffic && <span className="text-sky-600 dark:text-sky-400">Forwarding</span>}
                    {p.allow_gateway_transit && <span className="text-purple-600 dark:text-purple-400">Gateway</span>}
                  </div>
                </div>
                <PermissionGate permission="resources.delete">
                  <button
                    onClick={() => handleDeletePeering(p.name)}
                    disabled={deletingPeering === p.name}
                    className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                    title="Excluir peering"
                  >
                    <Unlink className="w-4 h-4" />
                  </button>
                </PermissionGate>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── NSG Rules Section ─────────────────────────────────────────── */}
      {(() => {
        const uniqueNSGs = [...new Set(subnets.filter(s => s.nsg_name).map(s => s.nsg_name))];
        if (uniqueNSGs.length === 0) return null;
        return (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                NSG Rules ({uniqueNSGs.length})
              </h3>
            </div>
            <div className="space-y-2">
              {uniqueNSGs.map(nsgName => {
                const cache = nsgRulesCache[nsgName] || {};
                const isExpanded = expandedNSG === nsgName;
                const activeTab = nsgActiveTab[nsgName] || 'Inbound';
                const visibleRules = (cache.rules || []).filter(r => r.direction === activeTab);
                return (
                  <div key={nsgName} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 text-left"
                      onClick={() => handleToggleNSG(nsgName)}
                    >
                      <div className="flex items-center gap-2">
                        <Shield className="w-3.5 h-3.5 text-orange-500" />
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{nsgName}</span>
                        {cache.rules && <span className="text-xs text-gray-500 dark:text-gray-400">{cache.rules.length} regra(s)</span>}
                      </div>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </button>

                    {isExpanded && (
                      <div className="border-t border-gray-200 dark:border-gray-700">
                        {/* Tab bar + add button */}
                        <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800/50">
                          <div className="flex gap-1">
                            {['Inbound', 'Outbound'].map(tab => (
                              <button key={tab}
                                onClick={() => setNsgActiveTab(prev => ({ ...prev, [nsgName]: tab }))}
                                className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${activeTab === tab ? 'bg-sky-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                              >
                                {tab === 'Inbound' ? 'Entrada' : 'Saída'}
                              </button>
                            ))}
                          </div>
                          <PermissionGate permission="resources.manage">
                            <button
                              onClick={() => { setAddingRuleFor(addingRuleFor === nsgName ? null : nsgName); setRuleForm(DEFAULT_NSG_RULE); }}
                              className="text-xs text-sky-600 hover:text-sky-700 dark:text-sky-400 flex items-center gap-1"
                            >
                              <Plus className="w-3 h-3" /> Adicionar
                            </button>
                          </PermissionGate>
                        </div>

                        {cache.loading && (
                          <div className="px-3 py-4 text-center text-xs text-gray-500 dark:text-gray-400">Carregando regras...</div>
                        )}

                        {/* Add rule inline form */}
                        {!cache.loading && addingRuleFor === nsgName && (
                          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border-b border-gray-200 dark:border-gray-700">
                            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Nova Regra NSG</p>
                            <div className="grid grid-cols-2 gap-2 mb-2">
                              <div>
                                <label className="text-xs text-gray-500 dark:text-gray-400 mb-0.5 block">Nome</label>
                                <input value={ruleForm.rule_name} onChange={e => setRuleForm(p => ({...p, rule_name: e.target.value}))}
                                  placeholder="Allow-HTTP"
                                  className="w-full text-xs px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-sky-500" />
                              </div>
                              <div>
                                <label className="text-xs text-gray-500 dark:text-gray-400 mb-0.5 block">Prioridade (100–4096)</label>
                                <input type="number" value={ruleForm.priority} onChange={e => setRuleForm(p => ({...p, priority: e.target.value}))}
                                  min="100" max="4096"
                                  className="w-full text-xs px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-sky-500" />
                              </div>
                              <div>
                                <label className="text-xs text-gray-500 dark:text-gray-400 mb-0.5 block">Direção</label>
                                <select value={ruleForm.direction} onChange={e => setRuleForm(p => ({...p, direction: e.target.value}))}
                                  className="w-full text-xs px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                                  <option value="Inbound">Entrada</option>
                                  <option value="Outbound">Saída</option>
                                </select>
                              </div>
                              <div>
                                <label className="text-xs text-gray-500 dark:text-gray-400 mb-0.5 block">Acesso</label>
                                <select value={ruleForm.access} onChange={e => setRuleForm(p => ({...p, access: e.target.value}))}
                                  className="w-full text-xs px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                                  <option value="Allow">Permitir</option>
                                  <option value="Deny">Negar</option>
                                </select>
                              </div>
                              <div>
                                <label className="text-xs text-gray-500 dark:text-gray-400 mb-0.5 block">Protocolo</label>
                                <select value={ruleForm.protocol} onChange={e => setRuleForm(p => ({...p, protocol: e.target.value}))}
                                  className="w-full text-xs px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                                  <option value="Tcp">TCP</option>
                                  <option value="Udp">UDP</option>
                                  <option value="Icmp">ICMP</option>
                                  <option value="*">Qualquer</option>
                                </select>
                              </div>
                              <div>
                                <label className="text-xs text-gray-500 dark:text-gray-400 mb-0.5 block">Porta Destino</label>
                                <input value={ruleForm.dest_port} onChange={e => setRuleForm(p => ({...p, dest_port: e.target.value}))}
                                  placeholder="80, 443 ou *"
                                  className="w-full text-xs px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
                              </div>
                              <div>
                                <label className="text-xs text-gray-500 dark:text-gray-400 mb-0.5 block">IP Origem</label>
                                <input value={ruleForm.source_address} onChange={e => setRuleForm(p => ({...p, source_address: e.target.value}))}
                                  placeholder="* ou 10.0.0.0/8"
                                  className="w-full text-xs px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
                              </div>
                              <div>
                                <label className="text-xs text-gray-500 dark:text-gray-400 mb-0.5 block">IP Destino</label>
                                <input value={ruleForm.dest_address} onChange={e => setRuleForm(p => ({...p, dest_address: e.target.value}))}
                                  placeholder="* ou 10.0.1.0/24"
                                  className="w-full text-xs px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
                              </div>
                            </div>
                            <div className="flex gap-2 justify-end">
                              <button onClick={() => setAddingRuleFor(null)}
                                className="text-xs px-3 py-1.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200">Cancelar</button>
                              <button onClick={() => handleAddRule(nsgName)} disabled={savingRule || !ruleForm.rule_name.trim()}
                                className="text-xs px-3 py-1.5 bg-sky-600 text-white rounded hover:bg-sky-700 disabled:opacity-50">
                                {savingRule ? 'Salvando...' : 'Criar Regra'}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Empty state */}
                        {!cache.loading && visibleRules.length === 0 && !cache.error && (
                          <p className="px-3 py-3 text-xs text-gray-500 dark:text-gray-400 italic">
                            Nenhuma regra de {activeTab === 'Inbound' ? 'entrada' : 'saída'}
                          </p>
                        )}

                        {/* Rules list */}
                        {!cache.loading && visibleRules.length > 0 && (
                          <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                            {visibleRules.map(rule => (
                              <div key={rule.name} className="group flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                                <span className="text-xs text-gray-400 dark:text-gray-500 w-9 shrink-0 font-mono">{rule.priority}</span>
                                <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate flex-1">{rule.name}</span>
                                <span className="text-xs text-gray-500 dark:text-gray-400 font-mono shrink-0">{rule.destination_port_range}</span>
                                <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">{rule.protocol === '*' ? 'Any' : rule.protocol}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${rule.access === 'Allow' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                                  {rule.access === 'Allow' ? 'Allow' : 'Deny'}
                                </span>
                                <PermissionGate permission="resources.manage">
                                  <button onClick={() => handleDeleteRule(nsgName, rule.name)} disabled={deletingRule === rule.name}
                                    className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-red-500 disabled:opacity-50 transition-opacity shrink-0">
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </PermissionGate>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      <PeeringModal
        isOpen={peeringModalOpen}
        onClose={() => setPeeringModalOpen(false)}
        onSubmit={handleCreatePeering}
        vnets={vnets}
        currentVnet={detailTarget}
        isLoading={peeringLoading}
      />
    </div>
  );
};


// ── Main component ──────────────────────────────────────────────────────────
const AzureVNets = () => {
  const { addTask } = useBackgroundTasks();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [noCredentials, setNoCredentials] = useState(false);
  const [vnets, setVnets] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [detailTarget, setDetailTarget] = useState(null);
  const formRef = useRef();
  const [searchParams] = useSearchParams();
  const query = (searchParams.get('q') || '').toLowerCase();

  const fetchData = async (isRefresh = false) => {
    try {
      isRefresh ? setRefreshing(true) : setLoading(true);
      setNoCredentials(false);
      const data = await azureService.listVNets();
      setVnets(data.vnets || []);
    } catch (err) {
      if (err.response?.status === 400) setNoCredentials(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const { mutate: createVNet, isLoading: creating, error: createError, success: createSuccess, reset } = useCreateResource(
    (data) => azureService.createVNet(data),
    { onSuccess: () => { setTimeout(() => { setModalOpen(false); reset(); setForm(defaultForm); fetchData(true); }, 1500); } }
  );

  const handleDelete = async () => {
    setIsDeleting(true);
    setDeleteError('');
    try {
      const result = await azureService.deleteVNet(deleteTarget.resource_group, deleteTarget.name);
      if (result?.task_id) {
        addTask({ id: result.task_id, label: result.label, status: 'queued', type: 'azure_vnet_delete' });
        toast.info(`Exclusão de "${deleteTarget.name}" em andamento em background.`);
        setVnets(prev => prev.filter(v => v.name !== deleteTarget.name));
      } else {
        fetchData(true);
      }
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(err.response?.data?.detail || err.message || 'Erro ao excluir VNet');
    } finally {
      setIsDeleting(false);
    }
  };

  const filtered = query
    ? vnets.filter(v =>
        v.name?.toLowerCase().includes(query) ||
        v.resource_group?.toLowerCase().includes(query) ||
        v.location?.toLowerCase().includes(query)
      )
    : vnets;

  if (loading) return <Layout><LoadingSpinner text="Carregando Virtual Networks..." /></Layout>;
  if (noCredentials) return <Layout><NoCredentialsMessage provider="azure" /></Layout>;

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-1">Virtual Networks</h1>
          <p className="text-gray-600 dark:text-gray-400">
            {filtered.length} de {vnets.length} rede(s){query && ` para "${query}"`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PermissionGate permission="resources.create">
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors"
            >
              <Plus className="w-4 h-4" /> Criar VNet
            </button>
          </PermissionGate>
          <button onClick={() => fetchData(true)} disabled={refreshing}
            className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-white bg-primary hover:bg-primary-dark disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <Network className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400">Nenhuma Virtual Network encontrada</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  {['Nome', 'Grupo de Recursos', 'Localização', 'Espaço de Endereço', 'Subnets', 'Peerings', 'Status', 'Ações'].map(h => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filtered.map(v => (
                  <tr key={v.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer" onClick={() => setDetailTarget(v)}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Network className="w-4 h-4 text-sky-500 flex-shrink-0" />
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{v.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{v.resource_group}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{v.location}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                      <div className="flex flex-col gap-0.5">
                        {(v.address_space || []).map((addr, i) => (
                          <span key={i} className="font-mono text-xs">{addr}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 font-medium">{v.subnets_count}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {v.subnets?.some(s => s.name) ? (
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {v.subnets.filter(s => s.name).length > 0 ? '—' : '0'}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-500 dark:text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        v.provisioning_state === 'Succeeded'
                          ? 'bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-100'
                          : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-800 dark:text-yellow-100'
                      }`}>{v.provisioning_state || '—'}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <PermissionGate permission="resources.delete">
                        <button
                          onClick={() => setDeleteTarget(v)}
                          className="text-red-400 hover:text-red-600 transition-colors"
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </PermissionGate>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreateResourceModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); reset(); setForm(defaultForm); }}
        onSubmit={() => createVNet(form)}
        onValidate={() => { formRef.current?.touchAll(); return formRef.current?.isValid === true; }}
        title="Criar Virtual Network"
        isLoading={creating}
        error={createError}
        success={createSuccess}
        templateBar={<TemplateBar provider="azure" resourceType="vnet" currentForm={form} onLoad={(cfg) => setForm({ ...defaultForm, ...cfg })} />}
      >
        <CreateAzureVNetForm ref={formRef} form={form} setForm={setForm} />
      </CreateResourceModal>

      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        onClose={() => { setDeleteTarget(null); setDeleteError(''); }}
        onConfirm={handleDelete}
        title="Excluir Virtual Network"
        description="A VNet deve estar vazia (sem subnets ou recursos associados) para ser excluída. Esta ação é permanente."
        confirmText={deleteTarget?.name}
        isLoading={isDeleting}
        error={deleteError}
      />

      <ResourceDetailDrawer
        isOpen={!!detailTarget}
        onClose={() => setDetailTarget(null)}
        title={detailTarget?.name}
        subtitle="Virtual Network"
        statusText={detailTarget?.provisioning_state}
        statusColor={detailTarget?.provisioning_state === 'Succeeded' ? 'green' : 'yellow'}
        queryKey={['azure-vnet-detail', detailTarget?.resource_group, detailTarget?.name]}
        queryFn={detailTarget ? () => azureService.getVNetDetail(detailTarget.resource_group, detailTarget.name) : null}
        sections={(detail) => [
          { title: 'Overview', fields: [
            { label: 'Nome', value: detailTarget?.name },
            { label: 'Resource Group', value: detailTarget?.resource_group },
            { label: 'Localização', value: detailTarget?.location },
            { label: 'Espaço de Endereço', value: (detail?.address_space || detailTarget?.address_space || []).join(', ') || '—' },
          ]},
          { title: 'DNS', fields: [
            { label: 'Servidores DNS', value: detail?.dns_servers?.join(', ') || 'Azure default' },
          ]},
        ]}
        extraContent={
          detailTarget && (
            <VNetDrawerExtra
              detailTarget={detailTarget}
              vnets={vnets}
              onRefresh={() => fetchData(true)}
            />
          )
        }
        tags={(detail) => detail?.tags}
      />
    </Layout>
  );
};

export default AzureVNets;
