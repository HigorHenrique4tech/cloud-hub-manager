import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  DollarSign, TrendingUp, TrendingDown, AlertCircle,
  Download, Printer, Plus, Trash2, Bell, CheckCircle,
} from 'lucide-react';
import Layout from '../components/layout/layout';
import LoadingSpinner from '../components/common/loadingspinner';
import costService from '../services/costService';
import alertService from '../services/alertService';

/* ── helpers ──────────────────────────────────────────────── */
const today = new Date();
const fmt = (d) => d.toISOString().slice(0, 10);

const PERIODS = [
  { label: '30d',  days: 30 },
  { label: '90d',  days: 90 },
  { label: '6m',   days: 180 },
  { label: '1 ano', days: 365 },
];

const PIE_COLORS = ['#f97316', '#0ea5e9'];

const fmtUSD = (v) =>
  v == null ? '—' : `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* ── small sub-components ─────────────────────────────────── */
const MetricCard = ({ icon: Icon, label, value, sub, color = 'blue' }) => {
  const bg = {
    blue:   'from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/20',
    green:  'from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/20',
    orange: 'from-orange-50 to-orange-100 dark:from-orange-900/30 dark:to-orange-800/20',
    purple: 'from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-800/20',
  }[color];
  const iconColor = {
    blue: 'text-blue-400', green: 'text-green-400',
    orange: 'text-orange-400', purple: 'text-purple-400',
  }[color];
  return (
    <div className={`bg-gradient-to-br ${bg} rounded-lg shadow-md p-5`}>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{label}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1 truncate">{value}</p>
          {sub && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{sub}</p>}
        </div>
        <Icon className={`w-10 h-10 ${iconColor} opacity-50 flex-shrink-0 ml-2`} />
      </div>
    </div>
  );
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-lg text-sm">
      <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {fmtUSD(p.value)}
        </p>
      ))}
    </div>
  );
};

/* ── Alert Modal ──────────────────────────────────────────── */
const PROVIDERS = ['aws', 'azure', 'all'];
const PERIODS_ALERT = ['daily', 'monthly'];
const THRESHOLD_TYPES = ['fixed', 'percentage'];

const AlertModal = ({ onClose, onSave }) => {
  const [form, setForm] = useState({
    name: '', provider: 'all', service: '',
    threshold_type: 'fixed', threshold_value: '', period: 'monthly',
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...form,
      threshold_value: parseFloat(form.threshold_value),
      service: form.service || null,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Novo Alerta de Custo</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome *</label>
            <input
              required value={form.name} onChange={(e) => set('name', e.target.value)}
              className="input w-full" placeholder="Ex: Alerta AWS Mensal"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Provedor</label>
              <select value={form.provider} onChange={(e) => set('provider', e.target.value)} className="input w-full">
                {PROVIDERS.map((p) => <option key={p} value={p}>{p === 'all' ? 'Todos' : p.toUpperCase()}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Período</label>
              <select value={form.period} onChange={(e) => set('period', e.target.value)} className="input w-full">
                {PERIODS_ALERT.map((p) => <option key={p} value={p}>{p === 'daily' ? 'Diário' : 'Mensal'}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Serviço (opcional)</label>
            <input
              value={form.service} onChange={(e) => set('service', e.target.value)}
              className="input w-full" placeholder="Ex: EC2, S3 (deixe vazio para total)"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo</label>
              <select value={form.threshold_type} onChange={(e) => set('threshold_type', e.target.value)} className="input w-full">
                {THRESHOLD_TYPES.map((t) => <option key={t} value={t}>{t === 'fixed' ? 'Valor fixo ($)' : 'Percentual (%)'}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Limite {form.threshold_type === 'fixed' ? '(USD)' : '(%)'}
              </label>
              <input
                required type="number" min="0" step="0.01"
                value={form.threshold_value} onChange={(e) => set('threshold_value', e.target.value)}
                className="input w-full" placeholder="0.00"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" className="btn-primary flex-1">Criar Alerta</button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* ── Main Component ───────────────────────────────────────── */
const Costs = () => {
  const [periodIdx, setPeriodIdx] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const qc = useQueryClient();

  const { days } = PERIODS[periodIdx];
  const endDate   = fmt(today);
  const startDate = fmt(new Date(today.getTime() - days * 86400000));

  const { data, isLoading, error } = useQuery({
    queryKey: ['combined-costs', startDate, endDate],
    queryFn: () => costService.getCombinedCosts(startDate, endDate, 'DAILY'),
    retry: false,
  });

  const { data: alerts = [] } = useQuery({
    queryKey: ['alerts'],
    queryFn: () => alertService.listAlerts(),
    retry: false,
  });

  const { data: eventsData } = useQuery({
    queryKey: ['alert-events'],
    queryFn: () => alertService.getEvents({ unread_only: false, limit: 10 }),
    retry: false,
  });
  const events = eventsData?.events || eventsData || [];

  const createMutation = useMutation({
    mutationFn: (d) => alertService.createAlert(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['alerts'] }); setShowModal(false); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => alertService.deleteAlert(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const markReadMutation = useMutation({
    mutationFn: (id) => alertService.markEventRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alert-events'] });
      qc.invalidateQueries({ queryKey: ['alert-events-unread'] });
    },
  });

  /* derived metrics */
  const metrics = useMemo(() => {
    if (!data) return null;
    const total = data.total || 0;
    const avgDaily = data.combined?.length ? total / data.combined.length : 0;
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const dayOfMonth = today.getDate();
    const daysLeft = daysInMonth - dayOfMonth;
    const projection = (data.aws?.total || 0) + (data.azure?.total || 0) > 0
      ? avgDaily * daysLeft + total
      : 0;
    const topService = data.by_service?.[0];
    return { total, avgDaily, projection, topService };
  }, [data]);

  /* CSV export */
  const exportCSV = () => {
    if (!data) return;
    const date = new Date().toLocaleDateString('pt-BR');
    const rows = [
      ['Relatório de Custos Cloud Hub Manager', '', ''],
      [`Período: ${startDate} a ${endDate}`, '', ''],
      [`Gerado em: ${date}`, '', ''],
      [''],
      ['Data', 'AWS (USD)', 'Azure (USD)', 'Total (USD)'],
      ...(data.combined || []).map((d) => [d.date, d.aws?.toFixed(4) || 0, d.azure?.toFixed(4) || 0, d.total?.toFixed(4) || 0]),
      [''],
      ['Serviço', 'Valor (USD)', ''],
      ...(data.by_service || []).map((s) => [s.name, s.amount?.toFixed(4), '']),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `custos-cloud-${date.replace(/\//g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => window.print();

  /* ── render ────────────────────────────────────────────── */
  if (isLoading) {
    return <Layout><LoadingSpinner text="Carregando dados de custos..." /></Layout>;
  }

  const hasAws   = !!data?.aws;
  const hasAzure = !!data?.azure;
  const hasAny   = hasAws || hasAzure;

  return (
    <Layout>
      {showModal && (
        <AlertModal
          onClose={() => setShowModal(false)}
          onSave={(d) => createMutation.mutate(d)}
        />
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Análise de Custos</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {startDate} → {endDate}
            {!hasAws && <span className="ml-2 text-yellow-600 dark:text-yellow-400">(sem dados AWS)</span>}
            {!hasAzure && <span className="ml-2 text-yellow-600 dark:text-yellow-400">(sem dados Azure)</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap no-print">
          {/* Period selector */}
          <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            {PERIODS.map((p, i) => (
              <button
                key={p.label}
                onClick={() => setPeriodIdx(i)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors
                  ${i === periodIdx
                    ? 'bg-primary text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button onClick={exportCSV} disabled={!hasAny}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors">
            <Download className="w-4 h-4" /> CSV
          </button>
          <button onClick={exportPDF}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <Printer className="w-4 h-4" /> PDF
          </button>
        </div>
      </div>

      {/* No credentials warning */}
      {!hasAny && (
        <div className="mb-6 flex items-center gap-3 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg text-yellow-800 dark:text-yellow-300">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm">Nenhum dado de custo disponível. Configure credenciais AWS e/ou Azure em <strong>Configurações</strong> e verifique as permissões para Cost Explorer / Cost Management.</span>
        </div>
      )}

      {/* Metric Cards */}
      {metrics && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          <MetricCard icon={DollarSign} label={`Total (${PERIODS[periodIdx].label})`} value={fmtUSD(metrics.total)} color="blue" />
          <MetricCard icon={TrendingUp} label="Média Diária" value={fmtUSD(metrics.avgDaily)} color="green" />
          <MetricCard icon={TrendingDown} label="Projeção do Mês" value={fmtUSD(metrics.projection)} sub="baseado na média diária" color="purple" />
          <MetricCard
            icon={AlertCircle}
            label="Maior Serviço"
            value={metrics.topService ? fmtUSD(metrics.topService.amount) : '—'}
            sub={metrics.topService?.name || ''}
            color="orange"
          />
        </div>
      )}

      {/* Charts */}
      {hasAny && data?.combined?.length > 0 && (
        <>
          {/* Line Chart */}
          <div className="card mb-6">
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4">Evolução Diária de Gastos</h2>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={data.combined} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} width={60} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                {hasAws   && <Line type="monotone" dataKey="aws"   name="AWS"   stroke="#f97316" strokeWidth={2} dot={false} />}
                {hasAzure && <Line type="monotone" dataKey="azure" name="Azure" stroke="#0ea5e9" strokeWidth={2} dot={false} />}
                <Line type="monotone" dataKey="total" name="Total" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="4 2" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Bar Chart */}
            {data.by_service?.length > 0 && (
              <div className="card lg:col-span-2">
                <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4">Top Serviços por Custo</h2>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={data.by_service.slice(0, 8)} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                    <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="amount" name="Custo" fill="#6366f1" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Pie Chart */}
            {hasAws && hasAzure && (
              <div className="card flex flex-col items-center justify-center">
                <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4 self-start">Distribuição por Cloud</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'AWS', value: data.aws?.total || 0 },
                        { name: 'Azure', value: data.azure?.total || 0 },
                      ]}
                      cx="50%" cy="50%" innerRadius={55} outerRadius={80}
                      dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {PIE_COLORS.map((c, i) => <Cell key={i} fill={c} />)}
                    </Pie>
                    <Tooltip formatter={(v) => fmtUSD(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Alert Management ─────────────────────────────── */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
            <Bell className="w-4 h-4" /> Alertas de Custo
          </h2>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" /> Novo Alerta
          </button>
        </div>

        {alerts.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
            Nenhum alerta configurado. Crie um para ser notificado quando os custos ultrapassarem um limite.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  {['Nome', 'Provedor', 'Período', 'Tipo', 'Limite', 'Ativo', ''].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {alerts.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-2.5 text-sm font-medium text-gray-900 dark:text-gray-100">{a.name}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-500 dark:text-gray-400 uppercase">{a.provider}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-500 dark:text-gray-400">{a.period === 'daily' ? 'Diário' : 'Mensal'}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-500 dark:text-gray-400">{a.threshold_type === 'fixed' ? 'Fixo' : '%'}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 font-mono">
                      {a.threshold_type === 'fixed' ? fmtUSD(a.threshold_value) : `${a.threshold_value}%`}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={a.is_active ? 'badge-success' : 'badge-gray'}>{a.is_active ? 'Sim' : 'Não'}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => deleteMutation.mutate(a.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded transition-colors"
                        title="Remover alerta"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Alert Events History ─────────────────────────── */}
      {events.length > 0 && (
        <div className="card">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2 mb-4">
            <AlertCircle className="w-4 h-4 text-red-500" /> Histórico de Disparos
          </h2>
          <div className="space-y-2">
            {events.map((ev) => (
              <div key={ev.id} className={`flex items-start gap-3 p-3 rounded-lg border text-sm
                ${ev.is_read
                  ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30'
                  : 'border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20'
                }`}>
                <AlertCircle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${ev.is_read ? 'text-gray-400' : 'text-orange-500'}`} />
                <div className="flex-1 min-w-0">
                  <p className={`font-medium ${ev.is_read ? 'text-gray-600 dark:text-gray-400' : 'text-orange-700 dark:text-orange-300'}`}>{ev.message}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {new Date(ev.triggered_at).toLocaleString('pt-BR')} · Valor: {fmtUSD(ev.current_value)} · Limite: {fmtUSD(ev.threshold_value)}
                  </p>
                </div>
                {!ev.is_read && (
                  <button
                    onClick={() => markReadMutation.mutate(ev.id)}
                    className="flex-shrink-0 p-1 text-gray-400 hover:text-green-500 dark:hover:text-green-400 transition-colors"
                    title="Marcar como lido"
                  >
                    <CheckCircle className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Costs;
