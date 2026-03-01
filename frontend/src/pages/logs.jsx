import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, FileText, ChevronDown, Download } from 'lucide-react';
import Layout from '../components/layout/layout';
import logsService from '../services/logsService';

const ACTION_LABELS = {
  'ec2.start':          'EC2 Iniciada',
  'ec2.stop':           'EC2 Parada',
  'azurevm.start':      'VM Azure Iniciada',
  'azurevm.stop':       'VM Azure Parada',
  'appservice.start':   'App Service Iniciado',
  'appservice.stop':    'App Service Parado',
  'credential.add':     'Credencial Adicionada',
  'credential.remove':  'Credencial Removida',
  'alert.create':       'Alerta Criado',
  'alert.delete':       'Alerta Excluído',
  'auth.login':         'Login',
  'auth.register':      'Cadastro',
  'schedule.create':    'Agendamento Criado',
  'schedule.update':    'Agendamento Atualizado',
  'schedule.delete':    'Agendamento Excluído',
  'finops.apply':       'Recomendação Aplicada',
  'finops.dismiss':     'Recomendação Ignorada',
  'finops.scan':        'Scan FinOps',
};

const STATUS_COLORS = {
  success: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  error:   'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const PROVIDER_COLORS = {
  aws:    'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  azure:  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  gcp:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  system: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
};

function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60)    return 'agora';
  if (diff < 3600)  return `${Math.floor(diff / 60)}min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return `${Math.floor(diff / 86400)}d atrás`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const PAGE_SIZE = 50;

const Logs = () => {
  const [filters, setFilters] = useState({ action: '', provider: '', startDate: '', endDate: '', userEmail: '' });
  const [offset, setOffset] = useState(0);
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['logs', filters, offset],
    queryFn: () => logsService.getLogs({ limit: PAGE_SIZE, offset, ...filters }),
    keepPreviousData: true,
  });

  const logs  = data?.logs  ?? [];
  const total = data?.total ?? 0;

  const handleFilter = (key, value) => {
    setFilters(f => ({ ...f, [key]: value }));
    setOffset(0);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await logsService.exportLogs(filters);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Logs de Atividade</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {total > 0 ? `${total} registros encontrados` : 'Nenhum registro'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              disabled={exporting || total === 0}
              className="btn btn-secondary flex items-center gap-2"
            >
              <Download className={`w-4 h-4 ${exporting ? 'animate-pulse' : ''}`} />
              {exporting ? 'Exportando…' : 'Exportar CSV'}
            </button>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="btn btn-secondary flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="card p-4 mb-5 grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Ação</label>
            <select
              className="input"
              value={filters.action}
              onChange={e => handleFilter('action', e.target.value)}
            >
              <option value="">Todas</option>
              {Object.entries(ACTION_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Provedor</label>
            <select
              className="input"
              value={filters.provider}
              onChange={e => handleFilter('provider', e.target.value)}
            >
              <option value="">Todos</option>
              <option value="aws">AWS</option>
              <option value="azure">Azure</option>
              <option value="gcp">GCP</option>
              <option value="system">Sistema</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Data início</label>
            <input
              type="date"
              className="input"
              value={filters.startDate}
              onChange={e => handleFilter('startDate', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Data fim</label>
            <input
              type="date"
              className="input"
              value={filters.endDate}
              onChange={e => handleFilter('endDate', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Email do usuário</label>
            <input
              type="text"
              className="input"
              placeholder="Buscar por email..."
              value={filters.userEmail}
              onChange={e => handleFilter('userEmail', e.target.value)}
            />
          </div>
        </div>

        {/* Table */}
        <div className="card overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <RefreshCw className="w-6 h-6 animate-spin mr-2" />
              Carregando logs...
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-16 text-gray-400 dark:text-gray-500">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p>Nenhuma atividade registrada.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Data/Hora</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Usuário</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Ação</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Recurso</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Provedor</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {logs.map(log => (
                    <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        <span title={formatDate(log.created_at)}>{timeAgo(log.created_at)}</span>
                        <div className="text-xs text-gray-400 dark:text-gray-500">{formatDate(log.created_at)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-white text-xs">{log.user_name || '—'}</div>
                        <div className="text-xs text-gray-400 dark:text-gray-500">{log.user_email}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-800 dark:text-gray-200">
                        {ACTION_LABELS[log.action] || log.action}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                        {log.resource_name || log.resource_id || '—'}
                        {log.detail && (
                          <div className="text-xs text-gray-400 dark:text-gray-500">{log.detail}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${PROVIDER_COLORS[log.provider] || PROVIDER_COLORS.system}`}>
                          {log.provider}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[log.status] || STATUS_COLORS.success}`}>
                          {log.status === 'success' ? 'Sucesso' : 'Erro'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Mostrando {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} de {total}
            </p>
            <div className="flex gap-2">
              <button
                className="btn btn-secondary text-sm"
                disabled={offset === 0}
                onClick={() => setOffset(o => Math.max(0, o - PAGE_SIZE))}
              >
                Anterior
              </button>
              <button
                className="btn btn-secondary text-sm"
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset(o => o + PAGE_SIZE)}
              >
                Próxima <ChevronDown className="w-4 h-4 rotate-[-90deg] inline" />
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Logs;
