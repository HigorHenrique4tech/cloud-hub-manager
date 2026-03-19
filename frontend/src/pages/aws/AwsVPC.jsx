import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, Plus, Trash2, Network, Link2, Unlink, Monitor, ChevronDown, ChevronUp, CheckCircle } from 'lucide-react';
import Layout from '../../components/layout/layout';
import LoadingSpinner from '../../components/common/loadingspinner';
import NoCredentialsMessage from '../../components/common/NoCredentialsMessage';
import CreateResourceModal from '../../components/common/CreateResourceModal';
import ConfirmDeleteModal from '../../components/common/ConfirmDeleteModal';
import CreateVPCForm from '../../components/create/CreateVPCForm';
import PermissionGate from '../../components/common/PermissionGate';
import useCreateResource from '../../hooks/useCreateResource';
import awsService from '../../services/awsservices';
import TemplateBar from '../../components/common/TemplateBar';
import ResourceDetailDrawer from '../../components/common/ResourceDetailDrawer';
import { useToast } from '../../contexts/ToastContext';

const defaultForm = { name: '', cidr_block: '10.0.0.0/16', enable_dns_support: true, enable_dns_hostnames: true, tenancy: 'default', subnets: [], tags: {}, tags_list: [] };

// ── Subnet inline form ──────────────────────────────────────────────────────
const SubnetForm = ({ onSubmit, onCancel, isLoading, azs }) => {
  const [name, setName] = useState('');
  const [cidr, setCidr] = useState('');
  const [az, setAz] = useState('');

  return (
    <div className="flex flex-col gap-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
      <div className="flex items-end gap-2">
        <div className="flex-1 min-w-0">
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Nome</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: public-subnet-1"
            className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-amber-500 focus:border-transparent" />
        </div>
        <div className="flex-1 min-w-0">
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">CIDR</label>
          <input value={cidr} onChange={(e) => setCidr(e.target.value)} placeholder="10.0.1.0/24"
            className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-amber-500 focus:border-transparent font-mono" />
        </div>
      </div>
      <div className="flex items-end gap-2">
        <div className="flex-1 min-w-0">
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Availability Zone</label>
          <select value={az} onChange={(e) => setAz(e.target.value)}
            className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
            <option value="">Automática</option>
            {(azs || []).map(z => <option key={z} value={z}>{z}</option>)}
          </select>
        </div>
        <button onClick={() => onSubmit({ name: name || undefined, cidr_block: cidr, availability_zone: az || undefined })}
          disabled={isLoading || !cidr.trim()}
          className="px-3 py-1.5 text-sm bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:opacity-50 whitespace-nowrap">
          {isLoading ? '...' : 'Adicionar'}
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200">Cancelar</button>
      </div>
    </div>
  );
};

// ── Peering modal ───────────────────────────────────────────────────────────
const PeeringModal = ({ isOpen, onClose, onSubmit, vpcs, currentVpc, isLoading }) => {
  const [peeringName, setPeeringName] = useState('');
  const [peerVpcId, setPeerVpcId] = useState('');

  if (!isOpen) return null;
  const availableVpcs = vpcs.filter(v => v.vpc_id !== currentVpc?.vpc_id);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Criar VPC Peering</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome do Peering</label>
            <input value={peeringName} onChange={(e) => setPeeringName(e.target.value)} placeholder="ex: vpc-hub-to-spoke"
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-amber-500 focus:border-transparent" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">VPC de Destino</label>
            <select value={peerVpcId} onChange={(e) => setPeerVpcId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-amber-500 focus:border-transparent">
              <option value="">Selecionar VPC...</option>
              {availableVpcs.map(v => <option key={v.vpc_id} value={v.vpc_id}>{v.name || v.vpc_id} ({v.cidr})</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200">Cancelar</button>
          <button onClick={() => { onSubmit({ name: peeringName || undefined, peer_vpc_id: peerVpcId }); setPeeringName(''); setPeerVpcId(''); }}
            disabled={isLoading || !peerVpcId}
            className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50">
            {isLoading ? 'Criando...' : 'Criar Peering'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Drawer extra content ────────────────────────────────────────────────────
const VPCDrawerExtra = ({ detailTarget, vpcs, onRefresh }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showSubnetForm, setShowSubnetForm] = useState(false);
  const [subnetLoading, setSubnetLoading] = useState(false);
  const [peeringModalOpen, setPeeringModalOpen] = useState(false);
  const [peeringLoading, setPeeringLoading] = useState(false);
  const [deletingSubnet, setDeletingSubnet] = useState(null);
  const [deletingPeering, setDeletingPeering] = useState(null);
  const [expandedSubnet, setExpandedSubnet] = useState(null);
  const [azs, setAzs] = useState([]);

  const vpcId = detailTarget?.vpc_id;

  const { data: detail } = useQuery({
    queryKey: ['aws-vpc-detail-extra', vpcId],
    queryFn: () => awsService.getVPCDetail(vpcId),
    enabled: !!vpcId,
    staleTime: 15_000,
  });

  // Load AZs on first subnet form open
  const handleShowSubnetForm = async () => {
    setShowSubnetForm(true);
    if (azs.length === 0) {
      try {
        const data = await awsService.listAvailabilityZones();
        setAzs(data?.zones?.map(z => z.zone_name || z) || []);
      } catch { /* ignore */ }
    }
  };

  const refreshDetail = () => {
    queryClient.invalidateQueries({ queryKey: ['aws-vpc-detail-extra', vpcId] });
    queryClient.invalidateQueries({ queryKey: ['aws-vpc-detail', vpcId] });
    onRefresh();
  };

  const handleCreateSubnet = async (data) => {
    setSubnetLoading(true);
    try {
      const result = await awsService.createVPCSubnet(vpcId, data);
      if (result.success) { toast.success(`Subnet criada com sucesso`); setShowSubnetForm(false); refreshDetail(); }
      else toast.error(result.error || 'Erro ao criar subnet');
    } catch (err) { toast.error(err.response?.data?.detail || 'Erro ao criar subnet'); }
    finally { setSubnetLoading(false); }
  };

  const handleDeleteSubnet = async (subnetId, subnetName) => {
    setDeletingSubnet(subnetId);
    try {
      const result = await awsService.deleteVPCSubnet(vpcId, subnetId);
      if (result.success) { toast.success(`Subnet "${subnetName || subnetId}" excluída`); refreshDetail(); }
      else toast.error(result.error || 'Erro ao excluir subnet');
    } catch (err) { toast.error(err.response?.data?.detail || 'Erro ao excluir subnet'); }
    finally { setDeletingSubnet(null); }
  };

  const handleCreatePeering = async (data) => {
    setPeeringLoading(true);
    try {
      const result = await awsService.createVPCPeering(vpcId, data);
      if (result.success) { toast.success('Peering criado — aguardando aceitação'); setPeeringModalOpen(false); refreshDetail(); }
      else toast.error(result.error || 'Erro ao criar peering');
    } catch (err) { toast.error(err.response?.data?.detail || 'Erro ao criar peering'); }
    finally { setPeeringLoading(false); }
  };

  const handleAcceptPeering = async (peeringId) => {
    try {
      const result = await awsService.acceptVPCPeering(peeringId);
      if (result.success) { toast.success('Peering aceito'); refreshDetail(); }
      else toast.error(result.error || 'Erro ao aceitar peering');
    } catch (err) { toast.error(err.response?.data?.detail || 'Erro ao aceitar peering'); }
  };

  const handleDeletePeering = async (peeringId) => {
    setDeletingPeering(peeringId);
    try {
      const result = await awsService.deleteVPCPeering(peeringId);
      if (result.success) { toast.success('Peering excluído'); refreshDetail(); }
      else toast.error(result.error || 'Erro ao excluir peering');
    } catch (err) { toast.error(err.response?.data?.detail || 'Erro ao excluir peering'); }
    finally { setDeletingPeering(null); }
  };

  const subnets = detail?.subnets || [];
  const peerings = detail?.peerings || [];

  const peeringStatusClass = (status) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-100';
      case 'pending-acceptance': return 'bg-amber-100 text-amber-700 dark:bg-amber-800 dark:text-amber-100';
      case 'failed': case 'rejected': case 'deleted': return 'bg-red-100 text-red-700 dark:bg-red-800 dark:text-red-100';
      default: return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  return (
    <div className="space-y-6">
      {/* Subnets */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Subnets ({subnets.length})</h3>
          <PermissionGate permission="resources.create">
            <button onClick={handleShowSubnetForm} className="text-xs text-amber-600 hover:text-amber-700 dark:text-amber-400 flex items-center gap-1">
              <Plus className="w-3 h-3" /> Adicionar
            </button>
          </PermissionGate>
        </div>

        {showSubnetForm && (
          <div className="mb-3">
            <SubnetForm onSubmit={handleCreateSubnet} onCancel={() => setShowSubnetForm(false)} isLoading={subnetLoading} azs={azs} />
          </div>
        )}

        {subnets.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">Nenhuma subnet</p>
        ) : (
          <div className="space-y-1">
            {subnets.map((s) => (
              <div key={s.id} className="group border border-gray-200 dark:border-gray-700 rounded-lg">
                <div className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  onClick={() => setExpandedSubnet(expandedSubnet === s.id ? null : s.id)}>
                  <div className="flex items-center gap-2 min-w-0">
                    <Network className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{s.name || s.id}</span>
                    <span className="text-xs font-mono text-gray-500 dark:text-gray-400">{s.cidr}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <PermissionGate permission="resources.delete">
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteSubnet(s.id, s.name); }}
                        disabled={deletingSubnet === s.id}
                        className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50" title="Excluir">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </PermissionGate>
                    {expandedSubnet === s.id ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                  </div>
                </div>
                {expandedSubnet === s.id && (
                  <div className="px-3 pb-2 pt-1 border-t border-gray-100 dark:border-gray-700/50 text-xs text-gray-500 dark:text-gray-400 space-y-1">
                    <div>AZ: {s.az}</div>
                    <div>IPs disponíveis: {s.available_ips}</div>
                    <div className="flex items-center gap-1.5">
                      <Monitor className="w-3 h-3" />
                      <span>Dispositivos: {s.connected_devices_count ?? 0}</span>
                    </div>
                    <div>{s.public ? '🌐 Pública (auto-assign IP)' : '🔒 Privada'}</div>
                    <div>Estado: {s.state}</div>
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
            <button onClick={() => setPeeringModalOpen(true)} className="text-xs text-amber-600 hover:text-amber-700 dark:text-amber-400 flex items-center gap-1">
              <Plus className="w-3 h-3" /> Criar Peering
            </button>
          </PermissionGate>
        </div>

        {peerings.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">Nenhum peering configurado</p>
        ) : (
          <div className="space-y-2">
            {peerings.map((p) => (
              <div key={p.id} className="group flex items-center justify-between border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link2 className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{p.name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${peeringStatusClass(p.status)}`}>{p.status}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                    <span>→ {p.remote_vpc_id}</span>
                    {p.remote_region && <span>({p.remote_region})</span>}
                    {p.remote_cidr && <span className="font-mono">{p.remote_cidr}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {p.status === 'pending-acceptance' && (
                    <PermissionGate permission="resources.create">
                      <button onClick={() => handleAcceptPeering(p.id)}
                        className="p-1 text-green-500 hover:text-green-600 opacity-0 group-hover:opacity-100 transition-opacity" title="Aceitar">
                        <CheckCircle className="w-4 h-4" />
                      </button>
                    </PermissionGate>
                  )}
                  <PermissionGate permission="resources.delete">
                    <button onClick={() => handleDeletePeering(p.id)}
                      disabled={deletingPeering === p.id}
                      className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50" title="Excluir">
                      <Unlink className="w-4 h-4" />
                    </button>
                  </PermissionGate>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <PeeringModal isOpen={peeringModalOpen} onClose={() => setPeeringModalOpen(false)}
        onSubmit={handleCreatePeering} vpcs={vpcs} currentVpc={detailTarget} isLoading={peeringLoading} />
    </div>
  );
};


// ── Main component ──────────────────────────────────────────────────────────
const AwsVPC = () => {
  const [searchParams] = useSearchParams();
  const q = (searchParams.get('q') || '').toLowerCase();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [detailTarget, setDetailTarget] = useState(null);
  const formRef = useRef();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['aws-vpc'],
    queryFn: () => awsService.listVPCs(),
    retry: false,
  });

  const { mutate: createVPC, isLoading: creating, error: createError, success: createSuccess, reset } = useCreateResource(
    (data) => awsService.createVPC(data),
    { onSuccess: () => { setTimeout(() => { setModalOpen(false); reset(); setForm(defaultForm); refetch(); }, 1500); } }
  );

  const handleDelete = async () => {
    setIsDeleting(true);
    setDeleteError('');
    try {
      await awsService.deleteVPC(deleteTarget.vpc_id);
      setDeleteTarget(null);
      refetch();
    } catch (err) {
      setDeleteError(err.response?.data?.detail || err.message || 'Erro ao excluir VPC');
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) return <Layout><LoadingSpinner text="Carregando VPCs..." /></Layout>;
  if (error?.response?.status === 400) return <Layout><NoCredentialsMessage provider="aws" /></Layout>;
  if (error) return (
    <Layout>
      <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-700 dark:text-red-300">
        <AlertCircle className="w-5 h-5 flex-shrink-0" /><span>{error.message || 'Erro ao carregar VPCs'}</span>
      </div>
    </Layout>
  );

  const vpcs = (data?.vpcs || []).filter(v =>
    !q || v.vpc_id?.toLowerCase().includes(q) || v.name?.toLowerCase().includes(q) || v.cidr?.toLowerCase().includes(q)
  );

  return (
    <Layout>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">VPC — Redes Virtuais</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Região: {data?.region || 'N/A'} · {vpcs.length} VPC(s){q && ` · filtrado por "${q}"`}
          </p>
        </div>
        <PermissionGate permission="resources.create">
          <button onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors">
            <Plus className="w-4 h-4" /> Criar VPC
          </button>
        </PermissionGate>
      </div>

      <div className="card overflow-x-auto">
        {vpcs.length === 0 ? (
          <p className="text-center py-8 text-gray-500 dark:text-gray-400">Nenhuma VPC encontrada</p>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                {['VPC ID', 'Nome', 'CIDR', 'Estado', 'Padrão', 'Subnets', 'Peerings', 'Ações'].map(h => (
                  <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {vpcs.map(v => (
                <tr key={v.vpc_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer" onClick={() => setDetailTarget(v)}>
                  <td className="px-6 py-4 text-sm font-mono text-gray-500 dark:text-gray-400 whitespace-nowrap">{v.vpc_id}</td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">{v.name || '—'}</td>
                  <td className="px-6 py-4 text-sm font-mono text-gray-900 dark:text-gray-100 whitespace-nowrap">{v.cidr || '—'}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={v.state === 'available' ? 'badge-success' : 'badge-warning'}>{v.state || '—'}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {v.is_default ? <span className="badge-gray">Padrão</span> : '—'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap">{v.subnets_count ?? 0}</td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">—</td>
                  <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <PermissionGate permission="resources.delete">
                      <button onClick={() => setDeleteTarget(v)} className="text-red-400 hover:text-red-600 transition-colors" title="Excluir">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </PermissionGate>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CreateResourceModal isOpen={modalOpen}
        onClose={() => { setModalOpen(false); reset(); setForm(defaultForm); }}
        onSubmit={() => createVPC(form)}
        onValidate={() => { formRef.current?.touchAll(); return formRef.current?.isValid ?? true; }}
        title="Criar VPC" isLoading={creating} error={createError} success={createSuccess}
        templateBar={<TemplateBar provider="aws" resourceType="vpc" currentForm={form} onLoad={(cfg) => setForm({ ...defaultForm, ...cfg })} />}>
        <CreateVPCForm ref={formRef} form={form} setForm={setForm} />
      </CreateResourceModal>

      <ConfirmDeleteModal isOpen={!!deleteTarget}
        onClose={() => { setDeleteTarget(null); setDeleteError(''); }}
        onConfirm={handleDelete} title="Excluir VPC"
        description="A VPC deve estar vazia (sem subnets, IGW ou ENIs) para ser excluída. Esta ação é permanente."
        confirmText={deleteTarget?.name || deleteTarget?.vpc_id} isLoading={isDeleting} error={deleteError} />

      <ResourceDetailDrawer isOpen={!!detailTarget} onClose={() => setDetailTarget(null)}
        title={detailTarget?.name || detailTarget?.vpc_id} subtitle="VPC"
        statusText={detailTarget?.state} statusColor={detailTarget?.state === 'available' ? 'green' : 'yellow'}
        queryKey={['aws-vpc-detail', detailTarget?.vpc_id]}
        queryFn={detailTarget ? () => awsService.getVPCDetail(detailTarget.vpc_id) : null}
        sections={(detail) => [
          { title: 'Overview', fields: [
            { label: 'VPC ID', value: detailTarget?.vpc_id, mono: true },
            { label: 'CIDR', value: detailTarget?.cidr, mono: true },
            { label: 'Estado', value: detailTarget?.state },
            { label: 'Padrão', value: detailTarget?.is_default ? 'Sim' : 'Não' },
            { label: 'Tenancy', value: detail?.tenancy },
          ]},
          { title: 'DNS', fields: [
            { label: 'DNS Support', value: detail?.enable_dns_support != null ? (detail.enable_dns_support ? 'Ativado' : 'Desativado') : undefined },
            { label: 'DNS Hostnames', value: detail?.enable_dns_hostnames != null ? (detail.enable_dns_hostnames ? 'Ativado' : 'Desativado') : undefined },
          ]},
          { title: 'Rede', fields: [
            { label: 'Internet Gateway', value: detail?.igw_id || '—', mono: true },
          ]},
        ]}
        extraContent={detailTarget && (
          <VPCDrawerExtra detailTarget={detailTarget} vpcs={data?.vpcs || []} onRefresh={() => refetch()} />
        )}
        tags={(detail) => detail?.tags} />
    </Layout>
  );
};

export default AwsVPC;
