import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Building2, UserPlus, Trash2, Shield, Copy, Clock, ArrowUpRight } from 'lucide-react';
import Header from '../components/layout/header';
import Sidebar from '../components/layout/sidebar';
import { useOrgWorkspace } from '../contexts/OrgWorkspaceContext';
import { RoleGate } from '../components/common/PermissionGate';
import ConfirmDeleteModal from '../components/common/ConfirmDeleteModal';
import orgService from '../services/orgService';

const ROLES = ['owner', 'admin', 'operator', 'viewer', 'billing'];

const OrgSettings = () => {
  const { currentOrg, refreshOrgs } = useOrgWorkspace();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const slug = currentOrg?.slug;

  // Members
  const { data: membersData, isLoading } = useQuery({
    queryKey: ['org-members', slug],
    queryFn: () => orgService.listMembers(slug),
    enabled: !!slug,
  });
  const members = membersData?.members || [];

  // Pending invitations
  const { data: invitesData } = useQuery({
    queryKey: ['org-invitations', slug],
    queryFn: () => orgService.listInvitations(slug),
    enabled: !!slug,
  });
  const pendingInvites = invitesData?.invitations || [];

  // Invite
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('viewer');
  const [inviteResult, setInviteResult] = useState(null);
  const inviteMutation = useMutation({
    mutationFn: () => orgService.inviteMember(slug, inviteEmail, inviteRole),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['org-members', slug] });
      qc.invalidateQueries({ queryKey: ['org-invitations', slug] });
      setInviteEmail('');
      if (data.status === 'pending') {
        setInviteResult(data);
      } else {
        setInviteResult(null);
      }
    },
  });

  // Cancel invitation
  const cancelInviteMutation = useMutation({
    mutationFn: (invitationId) => orgService.cancelInvitation(slug, invitationId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-invitations', slug] }),
  });

  // Role change
  const roleMutation = useMutation({
    mutationFn: ({ userId, role }) => orgService.updateMemberRole(slug, userId, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-members', slug] }),
  });

  // Remove member
  const removeMutation = useMutation({
    mutationFn: (userId) => orgService.removeMember(slug, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-members', slug] }),
  });

  // Modal state — remove member
  const [memberToRemove, setMemberToRemove] = useState(null); // { user_id, name }

  // Modal state — delete org
  const [showDeleteOrg, setShowDeleteOrg] = useState(false);
  const deleteOrgMutation = useMutation({
    mutationFn: () => orgService.deleteOrg(slug),
    onSuccess: () => {
      refreshOrgs();
      window.location.reload();
    },
  });

  // Org name update
  const [orgName, setOrgName] = useState('');
  const orgUpdateMutation = useMutation({
    mutationFn: (name) => orgService.updateOrg(slug, { name }),
    onSuccess: () => refreshOrgs(),
  });

  if (!currentOrg) return null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-6 space-y-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-primary" />
            Configurações da Organização
          </h1>

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

          {/* Members */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                <Shield className="w-5 h-5" /> Membros ({members.length})
              </h2>
            </div>

            {/* Invite form */}
            <RoleGate allowed={['owner', 'admin']}>
              <div className="flex items-end gap-3 mb-6 p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Email</label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="usuario@email.com"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                               bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Role</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                               bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                  >
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <button
                  onClick={() => inviteMutation.mutate()}
                  disabled={!inviteEmail || inviteMutation.isPending}
                  className="flex items-center gap-1 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  <UserPlus className="w-4 h-4" /> Convidar
                </button>
              </div>
              {inviteMutation.isError && (
                inviteMutation.error?.response?.data?.detail?.includes('Limite') ? (
                  <div className="flex items-center justify-between p-4 mb-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <p className="text-sm text-amber-800 dark:text-amber-200">{inviteMutation.error.response.data.detail}</p>
                    <button
                      onClick={() => navigate('/select-plan')}
                      className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-xs font-medium rounded-lg hover:bg-primary/90 flex-shrink-0 ml-4"
                    >
                      Fazer upgrade <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-red-500 mb-4">{inviteMutation.error?.response?.data?.detail || 'Erro ao convidar'}</p>
                )
              )}
              {inviteResult && inviteResult.status === 'pending' && (
                <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <p className="text-sm text-blue-800 dark:text-blue-200 mb-2">
                    Convite criado para <strong>{inviteResult.email}</strong>. Compartilhe o link abaixo:
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-white dark:bg-gray-700 px-3 py-2 rounded border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 overflow-x-auto">
                      {window.location.origin}{inviteResult.invite_link}
                    </code>
                    <button
                      onClick={() => navigator.clipboard.writeText(`${window.location.origin}${inviteResult.invite_link}`)}
                      className="flex items-center gap-1 px-3 py-2 bg-primary text-white text-xs rounded-lg hover:bg-primary/90"
                    >
                      <Copy className="w-3 h-3" /> Copiar
                    </button>
                  </div>
                </div>
              )}
            </RoleGate>

            {/* Members table */}
            {isLoading ? (
              <p className="text-sm text-gray-500">Carregando...</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                      <th className="py-2 px-3 font-medium">Nome</th>
                      <th className="py-2 px-3 font-medium">Email</th>
                      <th className="py-2 px-3 font-medium">Role</th>
                      <th className="py-2 px-3 font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {members.map((m) => (
                      <tr key={m.user_id} className="text-gray-800 dark:text-gray-200">
                        <td className="py-2 px-3">{m.name}</td>
                        <td className="py-2 px-3 text-gray-500 dark:text-gray-400">{m.email}</td>
                        <td className="py-2 px-3">
                          <RoleGate allowed={['owner', 'admin']} fallback={
                            <span className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 uppercase">{m.role}</span>
                          }>
                            <select
                              value={m.role}
                              onChange={(e) => roleMutation.mutate({ userId: m.user_id, role: e.target.value })}
                              className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600
                                         bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            >
                              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                            </select>
                          </RoleGate>
                        </td>
                        <td className="py-2 px-3">
                          <RoleGate allowed={['owner', 'admin']}>
                            <button
                              onClick={() => setMemberToRemove({ user_id: m.user_id, name: m.name })}
                              className="text-red-500 hover:text-red-700 transition-colors"
                              title="Remover membro"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </RoleGate>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pending Invitations */}
          {pendingInvites.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2 mb-4">
                <Clock className="w-5 h-5" /> Convites Pendentes ({pendingInvites.length})
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                      <th className="py-2 px-3 font-medium">Email</th>
                      <th className="py-2 px-3 font-medium">Role</th>
                      <th className="py-2 px-3 font-medium">Status</th>
                      <th className="py-2 px-3 font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {pendingInvites.map((inv) => (
                      <tr key={inv.id} className="text-gray-800 dark:text-gray-200">
                        <td className="py-2 px-3">{inv.email}</td>
                        <td className="py-2 px-3">
                          <span className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 uppercase">{inv.role}</span>
                        </td>
                        <td className="py-2 px-3">
                          {inv.is_expired ? (
                            <span className="text-xs px-2 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">Expirado</span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300">Pendente</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => navigator.clipboard.writeText(`${window.location.origin}/invite/${inv.token}`)}
                              className="text-xs text-primary hover:underline flex items-center gap-1"
                              title="Copiar link do convite"
                            >
                              <Copy className="w-3 h-3" /> Link
                            </button>
                            <RoleGate allowed={['owner', 'admin']}>
                              <button
                                onClick={() => cancelInviteMutation.mutate(inv.id)}
                                className="text-red-500 hover:text-red-700 transition-colors"
                                title="Cancelar convite"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </RoleGate>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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

          {/* Modals */}
          <ConfirmDeleteModal
            isOpen={!!memberToRemove}
            onClose={() => setMemberToRemove(null)}
            onConfirm={() => {
              removeMutation.mutate(memberToRemove.user_id, {
                onSuccess: () => setMemberToRemove(null),
              });
            }}
            title="Remover membro"
            description={`Deseja remover ${memberToRemove?.name || 'este membro'} da organização?`}
            confirmLabel="Remover"
            isLoading={removeMutation.isPending}
          />

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
        </main>
      </div>
    </div>
  );
};

export default OrgSettings;
