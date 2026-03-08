import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Layers, Mail, FileDown, Send, Plus, X, CheckCircle, RefreshCw, RotateCcw } from 'lucide-react';
import Header from '../components/layout/header';
import Sidebar from '../components/layout/sidebar';
import { useOrgWorkspace } from '../contexts/OrgWorkspaceContext';
import ConfirmDeleteModal from '../components/common/ConfirmDeleteModal';
import WorkspaceGeneralSection from '../components/workspace/WorkspaceGeneralSection';
import WorkspaceMembersSection from '../components/workspace/WorkspaceMembersSection';
import CloudAccountsSection from '../components/workspace/CloudAccountsSection';
import WorkspaceDangerZone from '../components/workspace/WorkspaceDangerZone';
import orgService from '../services/orgService';
import reportService from '../services/reportService';

// ── Executive Report Section ──────────────────────────────────────────────────

function ExecutiveReportSection() {
  const qc = useQueryClient();
  const [newEmail, setNewEmail] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateMsg, setGenerateMsg] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('');

  const periodOptions = useMemo(() => {
    const opts = [];
    const now = new Date();
    for (let i = 0; i <= 5; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      opts.push({ val, label });
    }
    return opts;
  }, []);

  const settingsQ = useQuery({
    queryKey: ['exec-report-settings'],
    queryFn: reportService.getSettings,
  });

  const reportsQ = useQuery({
    queryKey: ['exec-reports'],
    queryFn: () => reportService.list(),
  });

  const settingsMut = useMutation({
    mutationFn: reportService.saveSettings,
    onSuccess: () => qc.invalidateQueries(['exec-report-settings']),
  });

  const [sendMsg, setSendMsg] = useState(null);
  const sendMut = useMutation({
    mutationFn: (id) => reportService.send(id),
    onSuccess: () => setSendMsg({ ok: true, text: 'E-mail enviado com sucesso.' }),
    onError: (e) => setSendMsg({ ok: false, text: e?.response?.data?.detail || 'Erro ao enviar o e-mail.' }),
  });

  const retryMut = useMutation({
    mutationFn: (id) => reportService.retry(id),
    onSuccess: () => setTimeout(() => qc.invalidateQueries(['exec-reports']), 3000),
  });

  const s = settingsQ.data || {};
  const recipients = s.recipients || [];
  const reports = reportsQ.data?.reports || [];

  const save = (patch) => settingsMut.mutate({ ...s, ...patch, recipients: s.recipients || [] });
  const saveRecipients = (recs) => settingsMut.mutate({ ...s, recipients: recs });

  const addEmail = () => {
    const email = newEmail.trim();
    if (!email || recipients.includes(email)) return;
    saveRecipients([...recipients, email]);
    setNewEmail('');
  };

  const removeEmail = (email) => saveRecipients(recipients.filter(e => e !== email));

  const handleGenerate = async () => {
    setGenerating(true);
    setGenerateMsg(null);
    try {
      await reportService.generate(selectedPeriod || null);
      setGenerateMsg({ ok: true, text: 'Geração iniciada em segundo plano. Atualize em alguns segundos.' });
      setTimeout(() => qc.invalidateQueries(['exec-reports']), 5000);
    } catch (e) {
      setGenerateMsg({ ok: false, text: e?.response?.data?.detail || 'Erro ao gerar.' });
    } finally {
      setGenerating(false);
    }
  };

  const STATUS_COLOR = {
    ready:      'text-green-600 dark:text-green-400',
    generating: 'text-yellow-600 dark:text-yellow-400',
    failed:     'text-red-600 dark:text-red-400',
  };

  return (
    <section className="card space-y-5">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-blue-600/10 dark:bg-blue-500/10 p-2">
          <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Relatório Executivo</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            PDF mensal com custos, anomalias e recomendações, enviado automaticamente por e-mail.
          </p>
        </div>
      </div>

      {/* Enable toggle */}
      <label className="flex items-center gap-3 cursor-pointer">
        <div className="relative">
          <input type="checkbox" className="sr-only" checked={!!s.is_enabled}
            onChange={e => save({ is_enabled: e.target.checked })} />
          <div className={`w-10 h-6 rounded-full transition-colors ${s.is_enabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`} />
          <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${s.is_enabled ? 'translate-x-4' : ''}`} />
        </div>
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {s.is_enabled ? 'Ativado' : 'Desativado'}
        </span>
      </label>

      {/* Settings */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Dia do envio (1-28)</label>
          <input type="number" min={1} max={28} value={s.send_day || 1}
            onChange={e => save({ send_day: parseInt(e.target.value) || 1 })}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Incluir</label>
          {[
            ['include_costs',           'Custos'],
            ['include_anomalies',       'Anomalias'],
            ['include_recommendations', 'Recomendações'],
            ['include_schedules',       'Agendamentos'],
          ].map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input type="checkbox" checked={s[key] !== false}
                onChange={e => save({ [key]: e.target.checked })}
                className="accent-blue-600 h-3.5 w-3.5" />
              {label}
            </label>
          ))}
        </div>
      </div>

      {/* Recipients */}
      <div>
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Destinatários</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {recipients.map(email => (
            <span key={email} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full text-xs">
              {email}
              <button onClick={() => removeEmail(email)} className="hover:text-red-500">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addEmail()}
            type="email"
            placeholder="email@exemplo.com"
            className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button onClick={addEmail}
            className="flex items-center gap-1 px-3 py-2 text-sm font-medium bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors">
            <Plus className="w-4 h-4" /> Adicionar
          </button>
        </div>
      </div>

      {/* Generate now */}
      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-100 dark:border-gray-700">
        <select
          value={selectedPeriod}
          onChange={e => setSelectedPeriod(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg
                     bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none
                     focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Mês atual</option>
          {periodOptions.slice(1).map(o => (
            <option key={o.val} value={o.val}>{o.label}</option>
          ))}
        </select>
        <button onClick={handleGenerate} disabled={generating}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
          {generating ? 'Gerando...' : 'Gerar'}
        </button>
        {generateMsg && (
          <span className={`text-xs ${generateMsg.ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {generateMsg.text}
          </span>
        )}
      </div>

      {/* Reports list */}
      {reports.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">Relatórios gerados</h3>
          <div className="space-y-2">
            {reports.map(r => {
              const delta = r.summary_data?.costs?.delta_pct;
              return (
                <div key={r.id} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5">
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{r.period}</span>
                      <span className={`text-xs ${STATUS_COLOR[r.status] || 'text-gray-400'}`}>
                        {r.status === 'ready' ? '✓ Pronto' : r.status === 'generating' ? '⏳ Gerando...' : '✗ Falhou'}
                      </span>
                      {delta != null && r.status === 'ready' && (
                        <span className={`text-xs font-medium ${delta > 0 ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                          {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}% vs mês anterior
                        </span>
                      )}
                      {r.sent_at && (
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          · Enviado {new Date(r.sent_at).toLocaleDateString('pt-BR')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {r.status === 'ready' && (
                        <>
                          <button onClick={() => reportService.downloadPdf(r.id, r.period)}
                            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors">
                            <FileDown className="w-3.5 h-3.5" /> PDF
                          </button>
                          <button onClick={() => sendMut.mutate(r.id)} disabled={sendMut.isPending}
                            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-md transition-colors">
                            <Send className="w-3.5 h-3.5" /> Enviar
                          </button>
                        </>
                      )}
                      {r.status === 'failed' && (
                        <button
                          onClick={() => retryMut.mutate(r.id)}
                          disabled={retryMut.isPending}
                          className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-md transition-colors disabled:opacity-50"
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> Tentar novamente
                        </button>
                      )}
                    </div>
                  </div>
                  {r.status === 'failed' && r.error && (
                    <p className="text-xs text-red-500 dark:text-red-400 truncate" title={r.error}>
                      {r.error}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          {sendMsg && (
            <p className={`text-xs mt-1 ${sendMsg.ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {sendMsg.text}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

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

  const { data: availableData } = useQuery({
    queryKey: ['ws-members-available', slug, wsId],
    queryFn: () => orgService.listAvailableWorkspaceMembers(slug, wsId),
    enabled: !!slug && !!wsId,
  });
  const availableMembers = availableData?.members || [];

  const invalidateMembers = () => {
    qc.invalidateQueries({ queryKey: ['ws-members', slug, wsId] });
    qc.invalidateQueries({ queryKey: ['ws-members-available', slug, wsId] });
  };

  const overrideMutation = useMutation({
    mutationFn: ({ userId, roleOverride }) =>
      orgService.updateWorkspaceMemberRole(slug, wsId, userId, roleOverride),
    onSuccess: () => invalidateMembers(),
  });

  const addMemberMutation = useMutation({
    mutationFn: ({ userId, roleOverride }) =>
      orgService.addWorkspaceMember(slug, wsId, userId, roleOverride),
    onSuccess: () => invalidateMembers(),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId) => orgService.removeWorkspaceMember(slug, wsId, userId),
    onSuccess: () => invalidateMembers(),
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
            availableMembers={availableMembers}
            membersLoading={membersLoading}
            overrideMutation={overrideMutation}
            addMemberMutation={addMemberMutation}
            removeMemberMutation={removeMemberMutation}
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

          <ExecutiveReportSection />

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
