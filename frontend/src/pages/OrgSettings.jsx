import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Building2, UserPlus, Trash2, Shield, Copy, Clock, ArrowUpRight, Search,
  ChevronRight, Palette,
} from 'lucide-react';
import Header from '../components/layout/header';
import Sidebar from '../components/layout/sidebar';
import { useOrgWorkspace } from '../contexts/OrgWorkspaceContext';
import { RoleGate } from '../components/common/PermissionGate';
import ConfirmDeleteModal from '../components/common/ConfirmDeleteModal';
import InviteMemberModal from '../components/org/InviteMemberModal';
import MemberDetailDrawer from '../components/org/MemberDetailDrawer';
import orgService from '../services/orgService';
import WorkspaceCostComparison from '../components/workspace/WorkspaceCostComparison';
import WhiteLabelSettings from '../components/org/WhiteLabelSettings';

const ROLE_BADGE = {
  owner:    'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  admin:    'bg-blue-100   dark:bg-blue-900/30   text-blue-700   dark:text-blue-300',
  operator: 'bg-green-100  dark:bg-green-900/30  text-green-700  dark:text-green-300',
  viewer:   'bg-gray-100   dark:bg-gray-700       text-gray-700   dark:text-gray-300',
  billing:  'bg-amber-100  dark:bg-amber-900/30  text-amber-700  dark:text-amber-300',
};

const ROLE_LABEL = {
  owner: 'Owner', admin: 'Admin', operator: 'Operador', viewer: 'Visualizador', billing: 'Faturamento',
};

function MemberAvatar({ name }) {
  const initials = (name || '?').split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const colors = ['bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500'];
  const color = colors[(name || '').charCodeAt(0) % colors.length];
  return (
    <div className={`w-9 h-9 ${color} rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0`}>
      {initials}
    </div>
  );
}

const OrgSettings = () => {
  const { currentOrg, refreshOrgs, isPartnerOrg } = useOrgWorkspace();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const slug = currentOrg?.slug;
  const myRole = currentOrg?.role;
  const canManage = ['owner', 'admin'].includes(myRole);

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: membersData, isLoading } = useQuery({
    queryKey: ['org-members', slug],
    queryFn: () => orgService.listMembers(slug),
    enabled: !!slug,
  });
  const members = membersData?.members || [];

  const { data: invitesData } = useQuery({
    queryKey: ['org-invitations', slug],
    queryFn: () => orgService.listInvitations(slug),
    enabled: !!slug,
  });
  const pendingInvites = invitesData?.invitations || [];

  const { data: workspacesData } = useQuery({
    queryKey: ['workspaces', slug],
    queryFn: () => orgService.listWorkspaces(slug),
    enabled: !!slug,
    staleTime: 120_000,
  });
  const workspaces = workspacesData?.workspaces || [];

  // ── State ─────────────────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm]   = useState('');
  const [showInvite, setShowInvite]   = useState(false);
  const [inviteError, setInviteError] = useState(null);
  const [selectedMember, setSelectedMember] = useState(null);
  const [showDeleteOrg, setShowDeleteOrg]   = useState(false);
  const [orgName, setOrgName]               = useState('');

  // ── Mutations ─────────────────────────────────────────────────────────────
  const inviteMutation = useMutation({
    mutationFn: ({ email, role, phone, department }) =>
      orgService.inviteMember(slug, email, role, phone, department),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['org-members', slug] });
      qc.invalidateQueries({ queryKey: ['org-invitations', slug] });
      setShowInvite(false);
      setInviteError(null);
      if (data.status === 'pending') {
        // show invite link banner
        setInviteResult(data);
      }
    },
    onError: (err) => {
      setInviteError(err?.response?.data?.detail || 'Erro ao convidar');
    },
  });

  const [inviteResult, setInviteResult] = useState(null);

  const updateMutation = useMutation({
    mutationFn: ({ userId, data }) => orgService.updateMember(slug, userId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-members', slug] });
      if (selectedMember) {
        // Optimistically update the selected member in the drawer
        setSelectedMember((prev) => ({ ...prev, ...updateMutation.variables?.data, role: updateMutation.variables?.data?.role || prev.role }));
      }
    },
  });

  const removeMutation = useMutation({
    mutationFn: (userId) => orgService.removeMember(slug, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-members', slug] });
      setSelectedMember(null);
    },
  });

  const cancelInviteMutation = useMutation({
    mutationFn: (invitationId) => orgService.cancelInvitation(slug, invitationId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-invitations', slug] }),
  });

  const orgUpdateMutation = useMutation({
    mutationFn: (name) => orgService.updateOrg(slug, { name }),
    onSuccess: () => refreshOrgs(),
  });

  const deleteOrgMutation = useMutation({
    mutationFn: () => orgService.deleteOrg(slug),
    onSuccess: () => { refreshOrgs(); window.location.reload(); },
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  const filteredMembers = members.filter(
    (m) =>
      m.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.department?.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleInviteSubmit = ({ email, role, phone, department }) => {
    setInviteError(null);
    inviteMutation.mutate({ email, role, phone, department });
  };

  if (!currentOrg) return null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-6 space-y-6 max-w-5xl">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-primary" />
            Configurações da Organização
          </h1>

          {/* Partner org banner */}
          {isPartnerOrg && (
            <div className="flex items-center gap-3 rounded-xl border border-indigo-200 dark:border-indigo-800/40 bg-indigo-50 dark:bg-indigo-900/10 px-4 py-3">
              <Building2 size={18} className="text-primary flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-primary-dark dark:text-primary-light">Organização gerenciada</p>
                <p className="text-xs text-primary dark:text-primary-light mt-0.5">
                  Esta organização faz parte de um contrato Enterprise. O plano é herdado e gerenciado pelo parceiro master.
                </p>
              </div>
            </div>
          )}

          {/* Org Info */}
          <RoleGate allowed={['owner', 'admin']}>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Informações</h2>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome</label>
                  <input
                    type="text"
                    defaultValue={currentOrg.name}
                    onChange={(e) => setOrgName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                               bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                  />
                </div>
                <button
                  onClick={() => orgName && orgUpdateMutation.mutate(orgName)}
                  disabled={orgUpdateMutation.isPending}
                  className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  Salvar
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-400">Slug: <code>{currentOrg.slug}</code> | Plano: <code>{currentOrg.plan_tier}</code></p>
            </div>
          </RoleGate>

          {/* ── Members ──────────────────────────────────────────────────── */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">

            {/* Members header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                Membros
                <span className="text-sm font-normal text-gray-400">({members.length})</span>
              </h2>
              <RoleGate allowed={['owner', 'admin']}>
                <button
                  onClick={() => { setShowInvite(true); setInviteError(null); }}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium
                             hover:bg-primary/90 transition-all active:scale-[0.97] shadow-sm"
                >
                  <UserPlus className="w-4 h-4" /> Adicionar Membro
                </button>
              </RoleGate>
            </div>

            {/* Invite result banner */}
            {inviteResult?.status === 'pending' && (
              <div className="mx-6 mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                <p className="text-sm text-blue-800 dark:text-blue-200 mb-2">
                  Convite criado para <strong>{inviteResult.email}</strong>. Compartilhe o link abaixo:
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-white dark:bg-gray-700 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 overflow-x-auto">
                    {window.location.origin}{inviteResult.invite_link}
                  </code>
                  <button
                    onClick={() => { navigator.clipboard.writeText(`${window.location.origin}${inviteResult.invite_link}`); setInviteResult(null); }}
                    className="flex items-center gap-1 px-3 py-2 bg-primary text-white text-xs rounded-lg hover:bg-primary/90"
                  >
                    <Copy className="w-3 h-3" /> Copiar
                  </button>
                </div>
              </div>
            )}

            {/* Search */}
            {members.length > 4 && (
              <div className="px-6 pt-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar por nome, email ou departamento..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600
                               bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm
                               focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                  />
                </div>
              </div>
            )}

            {/* Members list */}
            <div className="p-4 space-y-1">
              {isLoading ? (
                <div className="space-y-2 p-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 rounded-xl bg-gray-100 dark:bg-gray-700 animate-pulse" />
                  ))}
                </div>
              ) : filteredMembers.length === 0 ? (
                <div className="py-10 text-center text-sm text-gray-400">
                  {searchTerm ? 'Nenhum membro encontrado' : 'Nenhum membro ainda'}
                </div>
              ) : (
                filteredMembers.map((m) => (
                  <button
                    key={m.user_id}
                    onClick={() => setSelectedMember(m)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50
                               transition-colors text-left group border border-transparent hover:border-gray-200 dark:hover:border-gray-700"
                  >
                    <MemberAvatar name={m.name} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {m.name || 'Sem nome'}
                        </p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_BADGE[m.role] || ROLE_BADGE.viewer}`}>
                          {ROLE_LABEL[m.role] || m.role}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">
                        {m.email}
                        {m.department && <> · <span className="text-gray-500 dark:text-gray-400">{m.department}</span></>}
                        {m.phone && <> · {m.phone}</>}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400 transition-colors flex-shrink-0" />
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Pending Invitations */}
          {pendingInvites.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2 mb-4">
                <Clock className="w-5 h-5" /> Convites Pendentes ({pendingInvites.length})
              </h2>
              <div className="space-y-2">
                {pendingInvites.map((inv) => (
                  <div key={inv.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-700">
                    <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center flex-shrink-0">
                      <Clock className="w-4 h-4 text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{inv.email}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_BADGE[inv.role] || ROLE_BADGE.viewer}`}>
                          {ROLE_LABEL[inv.role] || inv.role}
                        </span>
                        {inv.is_expired ? (
                          <span className="text-xs text-red-500">Expirado</span>
                        ) : (
                          <span className="text-xs text-yellow-600 dark:text-yellow-400">Pendente</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => navigator.clipboard.writeText(`${window.location.origin}/invite/${inv.token}`)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-primary hover:bg-primary/10 rounded-lg transition-colors"
                        title="Copiar link"
                      >
                        <Copy className="w-3 h-3" /> Link
                      </button>
                      <RoleGate allowed={['owner', 'admin']}>
                        <button
                          onClick={() => cancelInviteMutation.mutate(inv.id)}
                          className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          title="Cancelar convite"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </RoleGate>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* White Label (enterprise only) */}
          {currentOrg?.org_type === 'master' && (
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
              <WhiteLabelSettings />
            </div>
          )}

          {/* Danger Zone */}
          <RoleGate allowed={['owner']}>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-red-200 dark:border-red-900/50 p-6">
              <h2 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">Zona de Perigo</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Excluir esta organização removerá todos os workspaces, contas cloud e membros permanentemente.
              </p>
              <button
                onClick={() => setShowDeleteOrg(true)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
              >
                Excluir Organização
              </button>
            </div>
          </RoleGate>

          {/* Workspace Cost Comparison */}
          {workspaces.length > 1 && (
            <WorkspaceCostComparison orgSlug={slug} workspaces={workspaces} />
          )}
        </main>
      </div>

      {/* ── Modals / Drawers ──────────────────────────────────────────────── */}

      {showInvite && (
        <InviteMemberModal
          onClose={() => { setShowInvite(false); setInviteError(null); }}
          onSubmit={handleInviteSubmit}
          isLoading={inviteMutation.isPending}
          error={inviteError}
        />
      )}

      {selectedMember && (
        <MemberDetailDrawer
          member={selectedMember}
          onClose={() => setSelectedMember(null)}
          canManage={canManage}
          onUpdate={(data) => updateMutation.mutate({ userId: selectedMember.user_id, data })}
          onRemove={() => removeMutation.mutate(selectedMember.user_id)}
          isUpdating={updateMutation.isPending}
          isRemoving={removeMutation.isPending}
        />
      )}

      <ConfirmDeleteModal
        isOpen={showDeleteOrg}
        onClose={() => setShowDeleteOrg(false)}
        onConfirm={() => deleteOrgMutation.mutate()}
        title="Excluir organização"
        description="Esta ação é irreversível. Todos os workspaces, contas cloud e dados serão permanentemente excluídos."
        confirmText={currentOrg.name}
        confirmLabel="Excluir Organização"
        isLoading={deleteOrgMutation.isPending}
      />
    </div>
  );
};

export default OrgSettings;
