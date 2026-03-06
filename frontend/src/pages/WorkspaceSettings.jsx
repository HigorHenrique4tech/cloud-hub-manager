import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Layers } from 'lucide-react';
import Header from '../components/layout/header';
import Sidebar from '../components/layout/sidebar';
import { useOrgWorkspace } from '../contexts/OrgWorkspaceContext';
import ConfirmDeleteModal from '../components/common/ConfirmDeleteModal';
import WorkspaceGeneralSection from '../components/workspace/WorkspaceGeneralSection';
import WorkspaceMembersSection from '../components/workspace/WorkspaceMembersSection';
import CloudAccountsSection from '../components/workspace/CloudAccountsSection';
import WorkspaceDangerZone from '../components/workspace/WorkspaceDangerZone';
import orgService from '../services/orgService';

const WorkspaceSettings = () => {
  const { currentOrg, currentWorkspace, refreshWorkspaces } = useOrgWorkspace();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const slug = currentOrg?.slug;
  const wsId = currentWorkspace?.id;

  // Cloud Accounts
  const { data: accountsData, isLoading } = useQuery({
    queryKey: ['cloud-accounts', slug, wsId],
    queryFn: () => orgService.listAccounts(slug, wsId),
    enabled: !!slug && !!wsId,
  });
  const accounts = accountsData?.accounts || [];

  const [showForm, setShowForm]   = useState(false);
  const [provider, setProvider]   = useState('aws');
  const [label, setLabel]         = useState('');
  const [formData, setFormData]   = useState({});
  const [testResult, setTestResult] = useState(null);

  const createMutation = useMutation({
    mutationFn: () => orgService.createAccount(slug, wsId, { provider, label: label || 'default', data: formData }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cloud-accounts', slug, wsId] });
      setShowForm(false); setLabel(''); setFormData({});
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (accountId) => orgService.deleteAccount(slug, wsId, accountId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cloud-accounts', slug, wsId] }),
  });

  const testMutation = useMutation({
    mutationFn: (accountId) => orgService.testAccount(slug, wsId, accountId),
  });

  const [accountToDelete, setAccountToDelete] = useState(null);
  const [showDeleteWs, setShowDeleteWs]       = useState(false);

  const deleteWsMutation = useMutation({
    mutationFn: () => orgService.deleteWorkspace(slug, wsId),
    onSuccess: () => { refreshWorkspaces(); navigate('/'); },
  });

  const [wsName, setWsName]     = useState('');
  const [newWsName, setNewWsName] = useState('');

  const wsUpdateMutation = useMutation({
    mutationFn: (name) => orgService.updateWorkspace(slug, wsId, { name }),
    onSuccess: () => refreshWorkspaces(),
  });

  const createWsMutation = useMutation({
    mutationFn: () => orgService.createWorkspace(slug, { name: newWsName }),
    onSuccess: () => { refreshWorkspaces(); setNewWsName(''); },
  });

  const { data: membersData, isLoading: membersLoading } = useQuery({
    queryKey: ['ws-members', slug, wsId],
    queryFn: () => orgService.listWorkspaceMembers(slug, wsId),
    enabled: !!slug && !!wsId,
  });
  const wsMembers = membersData?.members || [];

  const overrideMutation = useMutation({
    mutationFn: ({ userId, roleOverride }) =>
      roleOverride
        ? orgService.updateWorkspaceMemberRole(slug, wsId, userId, roleOverride)
        : orgService.removeWorkspaceMemberOverride(slug, wsId, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ws-members', slug, wsId] }),
  });

  if (!currentOrg || !currentWorkspace) return null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-6 space-y-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Layers className="w-6 h-6 text-primary" />
            Configurações do Workspace
          </h1>

          <WorkspaceGeneralSection
            currentWorkspace={currentWorkspace}
            wsName={wsName} setWsName={setWsName}
            wsUpdateMutation={wsUpdateMutation}
            newWsName={newWsName} setNewWsName={setNewWsName}
            createWsMutation={createWsMutation}
            navigate={navigate}
          />

          <WorkspaceMembersSection
            wsMembers={wsMembers}
            membersLoading={membersLoading}
            overrideMutation={overrideMutation}
          />

          <CloudAccountsSection
            accounts={accounts} isLoading={isLoading}
            showForm={showForm} setShowForm={setShowForm}
            provider={provider} setProvider={setProvider}
            label={label} setLabel={setLabel}
            formData={formData} setFormData={setFormData}
            testResult={testResult} setTestResult={setTestResult}
            createMutation={createMutation}
            deleteMutation={deleteMutation}
            testMutation={testMutation}
            setAccountToDelete={setAccountToDelete}
            navigate={navigate}
          />

          <WorkspaceDangerZone onDelete={() => setShowDeleteWs(true)} />

          {/* Modals */}
          <ConfirmDeleteModal
            isOpen={!!accountToDelete}
            onClose={() => setAccountToDelete(null)}
            onConfirm={() => deleteMutation.mutate(accountToDelete.id, { onSuccess: () => setAccountToDelete(null) })}
            title="Excluir conta cloud"
            description={`Deseja excluir a conta "${accountToDelete?.label || ''}"? Os recursos associados não serão mais monitorados.`}
            confirmLabel="Excluir"
            isLoading={deleteMutation.isPending}
          />

          <ConfirmDeleteModal
            isOpen={showDeleteWs}
            onClose={() => setShowDeleteWs(false)}
            onConfirm={() => deleteWsMutation.mutate()}
            title="Excluir workspace"
            description="Esta ação é irreversível. Todas as contas cloud e dados deste workspace serão permanentemente excluídos."
            confirmText={currentWorkspace.name}
            confirmLabel="Excluir Workspace"
            isLoading={deleteWsMutation.isPending}
          />
        </main>
      </div>
    </div>
  );
};

export default WorkspaceSettings;
