import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Network, Plus, Trash2, AlertCircle, RefreshCw, CheckCircle, XCircle, Link2, Unlink, ChevronDown, ChevronUp, Globe } from 'lucide-react';
import Layout from '../../components/layout/layout';
import NoCredentialsMessage from '../../components/common/NoCredentialsMessage';
import EmptyState from '../../components/common/emptystate';
import SkeletonTable from '../../components/common/SkeletonTable';
import ConfirmDeleteModal from '../../components/common/ConfirmDeleteModal';
import PermissionGate from '../../components/common/PermissionGate';
import ResourceDetailDrawer from '../../components/common/ResourceDetailDrawer';
import gcpService from '../../services/gcpService';
import { useToast } from '../../contexts/ToastContext';

// ── Subnet inline form ──────────────────────────────────────────────────────
const SubnetForm = ({ onSubmit, onCancel, isLoading, regions }) => {
  const [name, setName] = useState('');
  const [cidr, setCidr] = useState('');
  const [region, setRegion] = useState('');

  return (
    <div className="flex flex-col gap-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
      <div className="flex items-end gap-2">
        <div className="flex-1 min-w-0">
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Nome</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: subnet-frontend"
            className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
        </div>
        <div className="flex-1 min-w-0">
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">CIDR</label>
          <input value={cidr} onChange={(e) => setCidr(e.target.value)} placeholder="10.0.1.0/24"
            className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent font-mono" />
        </div>
      </div>
      <div className="flex items-end gap-2">
        <div className="flex-1 min-w-0">
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Região</label>
          <select value={region} onChange={(e) => setRegion(e.target.value)}
            className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
            <option value="">Selecionar região...</option>
            {(regions || []).map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <button onClick={() => onSubmit({ name, ip_cidr_range: cidr, region })}
          disabled={isLoading || !cidr.trim() || !name.trim() || !region}
          className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap">
          {isLoading ? '...' : 'Adicionar'}
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200">Cancelar</button>
      </div>
    </div>
  );
};

// ── Peering modal ───────────────────────────────────────────────────────────
const PeeringModal = ({ isOpen, onClose, onSubmit, networks, currentNetwork, isLoading }) => {
  const [peeringName, setPeeringName] = useState('');
  const [peerNetwork, setPeerNetwork] = useState('');

  if (!isOpen) return null;
  const available = networks.filter(n => n.name !== currentNetwork?.name);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Criar Network Peering</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome do Peering</label>
            <input value={peeringName} onChange={(e) => setPeeringName(e.target.value)} placeholder="ex: hub-to-spoke"
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Rede de Destino</label>
            <select value={peerNetwork} onChange={(e) => setPeerNetwork(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent">
              <option value="">Selecionar rede...</option>
              {available.map(n => <option key={n.name} value={n.name}>{n.name}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200">Cancelar</button>
          <button onClick={() => { onSubmit({ peering_name: peeringName, peer_network: peerNetwork }); setPeeringName(''); setPeerNetwork(''); }}
            disabled={isLoading || !peeringName.trim() || !peerNetwork}
            className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">
            {isLoading ? 'Criando...' : 'Criar Peering'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Drawer extra content ────────────────────────────────────────────────────
const NetworkDrawerExtra = ({ detailTarget, networks, onRefresh }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showSubnetForm, setShowSubnetForm] = useState(false);
  const [subnetLoading, setSubnetLoading] = useState(false);
  const [peeringModalOpen, setPeeringModalOpen] = useState(false);
  const [peeringLoading, setPeeringLoading] = useState(false);
  const [deletingSubnet, setDeletingSubnet] = useState(null);
  const [deletingPeering, setDeletingPeering] = useState(null);
  const [expandedSubnet, setExpandedSubnet] = useState(null);
  const [regions, setRegions] = useState([]);

  const networkName = detailTarget?.name;

  const { data: detail } = useQuery({
    queryKey: ['gcp-network-detail-extra', networkName],
    queryFn: () => gcpService.getNetworkDetail(networkName),
    enabled: !!networkName,
    staleTime: 15_000,
  });

  const handleShowSubnetForm = async () => {
    setShowSubnetForm(true);
    if (regions.length === 0) {
      try {
        const data = await gcpService.listRegions();
        setRegions(Array.isArray(data) ? data : []);
      } catch { /* ignore */ }
    }
  };

  const refreshDetail = () => {
    queryClient.invalidateQueries({ queryKey: ['gcp-network-detail-extra', networkName] });
    queryClient.invalidateQueries({ queryKey: ['gcp-network-detail', networkName] });
    onRefresh();
  };

  const handleCreateSubnet = async (data) => {
    setSubnetLoading(true);
    try {
      const result = await gcpService.createSubnet(networkName, data);
      if (result.success) { toast.success('Subnet criada com sucesso'); setShowSubnetForm(false); refreshDetail(); }
      else toast.error(result.error || 'Erro ao criar subnet');
    } catch (err) { toast.error(err.response?.data?.detail || 'Erro ao criar subnet'); }
    finally { setSubnetLoading(false); }
  };

  const handleDeleteSubnet = async (region, subnetName) => {
    setDeletingSubnet(subnetName);
    try {
      const result = await gcpService.deleteSubnet(networkName, region, subnetName);
      if (result.success) { toast.success(`Subnet "${subnetName}" excluída`); refreshDetail(); }
      else toast.error(result.error || 'Erro ao excluir subnet');
    } catch (err) { toast.error(err.response?.data?.detail || 'Erro ao excluir subnet'); }
    finally { setDeletingSubnet(null); }
  };

  const handleCreatePeering = async (data) => {
    setPeeringLoading(true);
    try {
      const result = await gcpService.createPeering(networkName, data);
      if (result.success) { toast.success('Peering criado com sucesso'); setPeeringModalOpen(false); refreshDetail(); }
      else toast.error(result.error || 'Erro ao criar peering');
    } catch (err) { toast.error(err.response?.data?.detail || 'Erro ao criar peering'); }
    finally { setPeeringLoading(false); }
  };

  const handleDeletePeering = async (pName) => {
    setDeletingPeering(pName);
    try {
      const result = await gcpService.deletePeering(networkName, pName);
      if (result.success) { toast.success('Peering excluído'); refreshDetail(); }
      else toast.error(result.error || 'Erro ao excluir peering');
    } catch (err) { toast.error(err.response?.data?.detail || 'Erro ao excluir peering'); }
    finally { setDeletingPeering(null); }
  };

  const subnets = detail?.subnets || [];
  const peerings = detail?.peerings || [];

  const peeringStateClass = (state) => {
    switch (state) {
      case 'ACTIVE': return 'bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-100';
      case 'INACTIVE': return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
      default: return 'bg-amber-100 text-amber-700 dark:bg-amber-800 dark:text-amber-100';
    }
  };

  return (
    <div className="space-y-6">
      {/* Subnets */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Subnets ({subnets.length})</h3>
          <PermissionGate permission="resources.create">
            <button onClick={handleShowSubnetForm} className="text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
              <Plus className="w-3 h-3" /> Adicionar
            </button>
          </PermissionGate>
        </div>

        {showSubnetForm && (
          <div className="mb-3">
            <SubnetForm onSubmit={handleCreateSubnet} onCancel={() => setShowSubnetForm(false)} isLoading={subnetLoading} regions={regions} />
          </div>
        )}

        {subnets.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">Nenhuma subnet</p>
        ) : (
          <div className="space-y-1">
            {subnets.map((s) => (
              <div key={`${s.region}-${s.name}`} className="group border border-gray-200 dark:border-gray-700 rounded-lg">
                <div className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  onClick={() => setExpandedSubnet(expandedSubnet === s.name ? null : s.name)}>
                  <div className="flex items-center gap-2 min-w-0">
                    <Network className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{s.name}</span>
                    <span className="text-xs font-mono text-gray-500 dark:text-gray-400">{s.ip_cidr_range}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <PermissionGate permission="resources.delete">
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteSubnet(s.region, s.name); }}
                        disabled={deletingSubnet === s.name}
                        className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50" title="Excluir">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </PermissionGate>
                    {expandedSubnet === s.name ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                  </div>
                </div>
                {expandedSubnet === s.name && (
                  <div className="px-3 pb-2 pt-1 border-t border-gray-100 dark:border-gray-700/50 text-xs text-gray-500 dark:text-gray-400 space-y-1">
                    <div className="flex items-center gap-1.5"><Globe className="w-3 h-3" /><span>Região: {s.region}</span></div>
                    <div>Gateway: {s.gateway_address || '—'}</div>
                    <div>Private Google Access: {s.private_ip_google_access ? 'Ativado' : 'Desativado'}</div>
                    <div>Propósito: {s.purpose || 'PRIVATE'}</div>
                    <div>Estado: {s.state || 'READY'}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Peerings */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Peerings ({peerings.length})</h3>
          <PermissionGate permission="resources.create">
            <button onClick={() => setPeeringModalOpen(true)} className="text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
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
                    <Link2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{p.name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${peeringStateClass(p.state)}`}>{p.state}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                    <span>→ {p.network}</span>
                    {p.exchange_subnet_routes && <span className="text-emerald-500">troca rotas</span>}
                  </div>
                </div>
                <PermissionGate permission="resources.delete">
                  <button onClick={() => handleDeletePeering(p.name)}
                    disabled={deletingPeering === p.name}
                    className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50" title="Excluir">
                    <Unlink className="w-4 h-4" />
                  </button>
                </PermissionGate>
              </div>
            ))}
          </div>
        )}
      </div>

      <PeeringModal isOpen={peeringModalOpen} onClose={() => setPeeringModalOpen(false)}
        onSubmit={handleCreatePeering} networks={networks} currentNetwork={detailTarget} isLoading={peeringLoading} />
    </div>
  );
};


// ── Main component ──────────────────────────────────────────────────────────
const GcpVPC = () => {
  const [searchParams] = useSearchParams();
  const q = (searchParams.get('q') || '').toLowerCase();
  const qc = useQueryClient();
  const [toDelete, setToDelete] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', auto_create_subnetworks: true });
  const [formError, setFormError] = useState('');
  const [detailTarget, setDetailTarget] = useState(null);

  const { data: networks = [], isLoading, error, refetch } = useQuery({
    queryKey: ['gcp-networks'],
    queryFn: () => gcpService.listNetworks(),
    retry: false,
  });

  const createMutation = useMutation({
    mutationFn: () => gcpService.createNetwork(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gcp-networks'] });
      setShowForm(false);
      setForm({ name: '', auto_create_subnetworks: true });
      setFormError('');
    },
    onError: (err) => setFormError(err.response?.data?.detail || 'Erro ao criar rede VPC'),
  });

  const deleteMutation = useMutation({
    mutationFn: (name) => gcpService.deleteNetwork(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gcp-networks'] });
      setToDelete(null);
    },
  });

  if (error?.response?.status === 400) {
    return <Layout><NoCredentialsMessage provider="gcp" /></Layout>;
  }
  if (error) {
    return (
      <Layout>
        <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-700 dark:text-red-300">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error.message || 'Erro ao carregar dados'}</span>
        </div>
      </Layout>
    );
  }

  const filtered = networks.filter(n =>
    !q || n.name?.toLowerCase().includes(q) || n.description?.toLowerCase().includes(q)
  );

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">VPC Networks</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {!isLoading && `${filtered.length} rede(s)`}{q && ` · filtrado por "${q}"`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <PermissionGate permission="resources.create">
            <button
              onClick={() => setShowForm(!showForm)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg text-white bg-primary hover:bg-primary/90"
            >
              <Plus className="w-4 h-4" /> Nova Rede
            </button>
          </PermissionGate>
        </div>
      </div>

      {error && error?.response?.status !== 400 && (
        <div className="flex items-center gap-3 p-4 mb-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-700 dark:text-red-300">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error.message || 'Erro ao carregar redes VPC'}</span>
        </div>
      )}

      {/* Create Form */}
      {showForm && (
        <div className="card mb-6">
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4">Nova Rede VPC</h3>
          <div className="space-y-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nome da rede *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="minha-vpc"
                className="w-full max-w-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
              />
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="auto-subnets"
                checked={form.auto_create_subnetworks}
                onChange={(e) => setForm({ ...form, auto_create_subnetworks: e.target.checked })}
                className="rounded border-gray-300 dark:border-gray-600 text-primary"
              />
              <label htmlFor="auto-subnets" className="text-sm text-gray-700 dark:text-gray-300">
                Criar sub-redes automaticamente por região
              </label>
            </div>
          </div>
          {formError && <p className="text-sm text-red-500 mb-3">{formError}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => createMutation.mutate()}
              disabled={!form.name || createMutation.isPending}
              className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Criando...' : 'Criar Rede'}
            </button>
            <button
              onClick={() => { setShowForm(false); setFormError(''); }}
              className="px-4 py-2 text-gray-600 dark:text-gray-400 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        {isLoading ? (
          <SkeletonTable rows={4} cols={6} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Network}
            title="Nenhuma rede VPC encontrada"
            description="Crie uma rede VPC para organizar seus recursos GCP."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  {['Nome', 'Modo de Roteamento', 'Auto Subnets', 'Sub-redes', 'Peerings', 'Criada em', 'Ações'].map(h => (
                    <th key={h} className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((net) => (
                  <tr key={net.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer"
                    onClick={() => setDetailTarget(net)}>
                    <td className="py-3 px-4 font-medium text-gray-900 dark:text-gray-100">{net.name}</td>
                    <td className="py-3 px-4 text-gray-500 dark:text-gray-400 text-xs">{net.routing_mode}</td>
                    <td className="py-3 px-4">
                      {net.auto_create_subnetworks
                        ? <CheckCircle className="w-4 h-4 text-green-500" />
                        : <XCircle className="w-4 h-4 text-gray-300 dark:text-gray-600" />
                      }
                    </td>
                    <td className="py-3 px-4 text-gray-500 dark:text-gray-400 text-xs">
                      {net.subnetworks?.length ?? 0}
                    </td>
                    <td className="py-3 px-4 text-gray-500 dark:text-gray-400 text-xs">—</td>
                    <td className="py-3 px-4 text-gray-400 dark:text-gray-500 text-xs">
                      {net.creation_timestamp ? new Date(net.creation_timestamp).toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                      <PermissionGate permission="resources.delete">
                        <button
                          onClick={() => setToDelete(net)}
                          className="p-1.5 rounded text-gray-400 hover:text-red-500 transition-colors"
                          title="Deletar rede"
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

      <ConfirmDeleteModal
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => deleteMutation.mutate(toDelete.name)}
        title="Deletar rede VPC"
        description={`Deseja deletar permanentemente a rede "${toDelete?.name}"? Todas as sub-redes e peerings associados também serão removidos.`}
        confirmLabel="Deletar"
        isLoading={deleteMutation.isPending}
      />

      <ResourceDetailDrawer
        isOpen={!!detailTarget}
        onClose={() => setDetailTarget(null)}
        title={detailTarget?.name}
        subtitle="VPC Network"
        queryKey={['gcp-network-detail', detailTarget?.name]}
        queryFn={detailTarget ? () => gcpService.getNetworkDetail(detailTarget.name) : null}
        sections={(detail) => [
          { title: 'Overview', fields: [
            { label: 'Nome', value: detailTarget?.name },
            { label: 'ID', value: detailTarget?.id, mono: true },
            { label: 'Modo de Roteamento', value: detail?.routing_mode || detailTarget?.routing_mode },
            { label: 'Auto Subnets', value: (detail?.auto_create_subnetworks ?? detailTarget?.auto_create_subnetworks) ? 'Sim' : 'Não' },
            { label: 'MTU', value: detail?.mtu ? String(detail.mtu) : undefined },
            { label: 'Subnets', value: String(detail?.subnets_count ?? detailTarget?.subnetworks?.length ?? 0) },
            { label: 'Peerings', value: String(detail?.peerings_count ?? 0) },
          ]},
        ]}
        extraContent={detailTarget && (
          <NetworkDrawerExtra detailTarget={detailTarget} networks={networks} onRefresh={() => refetch()} />
        )}
      />
    </Layout>
  );
};

export default GcpVPC;
