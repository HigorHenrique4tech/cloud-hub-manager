import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Receipt, RefreshCw, Search, Download, X, FileText, AlertCircle,
  CheckCircle, Clock, ExternalLink, Building2, DollarSign,
} from 'lucide-react';
import Layout from '../../components/layout/layout';
import LoadingSpinner from '../../components/common/loadingspinner';
import orgService from '../../services/orgService';
import { useOrgWorkspace } from '../../contexts/OrgWorkspaceContext';
import { useEscapeKey } from '../../hooks/useEscapeKey';

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtCurrency = (value, currency) => {
  if (value == null) return '—';
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currency || 'BRL' }).format(value);
  } catch {
    return `${currency || ''} ${Number(value).toFixed(2)}`;
  }
};

const STATUS_CONFIG = {
  paid:        { label: 'Paga',     cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300', Icon: CheckCircle },
  unpaid:      { label: 'Em aberto',cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', Icon: Clock },
  pending:     { label: 'Pendente', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',     Icon: Clock },
  overdue:     { label: 'Vencida',  cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',         Icon: AlertCircle },
};

function StatusBadge({ status }) {
  const key = (status || '').toLowerCase();
  const cfg = STATUS_CONFIG[key] || { label: status || '—', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400', Icon: FileText };
  const { label, cls, Icon } = cfg;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>
      <Icon size={11} /> {label}
    </span>
  );
}

// ── Invoice Drawer ───────────────────────────────────────────────────────────

const DRAWER_TABS = ['Resumo', 'Itens M365 / Onetime', 'Uso Azure'];

function InvoiceDrawer({ invoice, orgSlug, workspaceId, onClose }) {
  useEscapeKey(true, onClose);
  const [tab, setTab] = useState(0);

  const onetimeQ = useQuery({
    queryKey: ['pc-invoice-lineitems', invoice.id, 'onetime', 'billinglineitems'],
    queryFn: () => orgService.pcGetInvoiceLineItems(orgSlug, workspaceId, invoice.id, {
      provider: 'onetime',
      line_item_type: 'billinglineitems',
    }),
    enabled: tab === 1,
    staleTime: 30 * 60_000,
  });

  const azureQ = useQuery({
    queryKey: ['pc-invoice-lineitems', invoice.id, 'azure', 'usagelineitems'],
    queryFn: () => orgService.pcGetInvoiceLineItems(orgSlug, workspaceId, invoice.id, {
      provider: 'azure',
      line_item_type: 'usagelineitems',
    }),
    enabled: tab === 2,
    staleTime: 30 * 60_000,
  });

  const groupedOnetime = useMemo(() => {
    const items = onetimeQ.data?.items || [];
    const groups = new Map();
    for (const item of items) {
      const key = item.customer_name || item.customer_id || 'Sem cliente';
      if (!groups.has(key)) groups.set(key, { items: [], totals: {} });
      const g = groups.get(key);
      g.items.push(item);
      const cur = item.currency || 'USD';
      g.totals[cur] = (g.totals[cur] || 0) + (Number(item.amount) || 0);
    }
    return Array.from(groups.entries());
  }, [onetimeQ.data]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-3xl flex-col bg-white dark:bg-gray-900 shadow-2xl border-l border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">Fatura {invoice.id}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {fmtDate(invoice.invoice_date)} · {fmtCurrency(invoice.total_amount, invoice.currency_code)}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex gap-0 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 px-6">
          {DRAWER_TABS.map((t, i) => (
            <button key={t} onClick={() => setTab(i)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === i
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}>
              {t}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {tab === 0 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Período de cobrança', value: `${fmtDate(invoice.billing_period_start)} → ${fmtDate(invoice.billing_period_end)}` },
                  { label: 'Data da fatura', value: fmtDate(invoice.invoice_date) },
                  { label: 'Vencimento', value: fmtDate(invoice.due_date) },
                  { label: 'Valor total', value: fmtCurrency(invoice.total_amount, invoice.currency_code) },
                  { label: 'Valor pago', value: fmtCurrency(invoice.paid_amount, invoice.currency_code) },
                  { label: 'Status', value: <StatusBadge status={invoice.status} /> },
                ].map(({ label, value }) => (
                  <div key={label} className="card p-3">
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-1">{value}</p>
                  </div>
                ))}
              </div>
              {invoice.document_type && (
                <p className="text-xs text-gray-500 dark:text-gray-400">Tipo: {invoice.document_type}</p>
              )}
            </div>
          )}

          {tab === 1 && (
            onetimeQ.isLoading ? (
              <div className="flex justify-center py-10"><LoadingSpinner /></div>
            ) : onetimeQ.isError ? (
              <p className="text-sm text-red-600 dark:text-red-400">{onetimeQ.error?.response?.data?.detail || 'Erro ao carregar itens'}</p>
            ) : groupedOnetime.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-10">Nenhum item Onetime nesta fatura.</p>
            ) : (
              <div className="space-y-4">
                {groupedOnetime.map(([customer, { items, totals }]) => (
                  <div key={customer} className="card p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 inline-flex items-center gap-2">
                        <Building2 size={14} className="text-blue-500" /> {customer}
                      </p>
                      <div className="text-right text-xs text-gray-500 dark:text-gray-400">
                        {Object.entries(totals).map(([cur, sum]) => (
                          <p key={cur} className="font-medium text-gray-900 dark:text-gray-100">{fmtCurrency(sum, cur)}</p>
                        ))}
                        <p>{items.length} item(s)</p>
                      </div>
                    </div>
                    <div className="divide-y divide-gray-100 dark:divide-gray-700/60">
                      {items.map((it, idx) => (
                        <div key={idx} className="py-2 flex items-start gap-3 text-xs">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-800 dark:text-gray-200 truncate">{it.product_name || it.subscription_description || it.sku_name}</p>
                            <p className="text-gray-400 dark:text-gray-500 truncate">
                              {it.charge_type} · qty {it.quantity} · {fmtDate(it.charge_start_date)} → {fmtDate(it.charge_end_date)}
                            </p>
                          </div>
                          <p className="font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">{fmtCurrency(it.amount, it.currency)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {tab === 2 && (
            azureQ.isLoading ? (
              <div className="flex justify-center py-10"><LoadingSpinner /></div>
            ) : azureQ.isError ? (
              <p className="text-sm text-red-600 dark:text-red-400">{azureQ.error?.response?.data?.detail || 'Erro ao carregar uso Azure'}</p>
            ) : (azureQ.data?.items || []).length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-10">Nenhum item de uso Azure nesta fatura.</p>
            ) : (
              <div className="card p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{azureQ.data.items.length} registro(s) de uso</p>
                <div className="divide-y divide-gray-100 dark:divide-gray-700/60 max-h-[60vh] overflow-y-auto">
                  {azureQ.data.items.slice(0, 200).map((it, idx) => (
                    <div key={idx} className="py-2 flex items-start gap-3 text-xs">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-800 dark:text-gray-200 truncate">{it.customer_name} — {it.product_name || it.sku_name}</p>
                        <p className="text-gray-400 dark:text-gray-500 truncate">qty {it.quantity} · {fmtDate(it.charge_start_date)}</p>
                      </div>
                      <p className="font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">{fmtCurrency(it.amount, it.currency)}</p>
                    </div>
                  ))}
                  {azureQ.data.items.length > 200 && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-2">
                      Mostrando 200 de {azureQ.data.items.length} itens
                    </p>
                  )}
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function PartnerCenterBilling() {
  const { currentOrg, currentWorkspace } = useOrgWorkspace();
  const orgSlug = currentOrg?.slug;
  const workspaceId = currentWorkspace?.id;

  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [downloading, setDownloading] = useState(null);

  const statusQ = useQuery({
    queryKey: ['pc-status', orgSlug, workspaceId],
    queryFn: () => orgService.pcStatus(orgSlug, workspaceId),
    enabled: Boolean(orgSlug && workspaceId),
    retry: false,
    staleTime: 60_000,
  });

  const invoicesQ = useQuery({
    queryKey: ['pc-invoices', orgSlug, workspaceId],
    queryFn: () => orgService.pcListInvoices(orgSlug, workspaceId, { size: 200, offset: 0 }),
    enabled: Boolean(statusQ.data?.configured && statusQ.data?.token_valid),
    staleTime: 30 * 60_000,
  });

  const invoices = invoicesQ.data?.invoices || [];
  const filtered = useMemo(() => {
    if (!search.trim()) return invoices;
    const q = search.trim().toLowerCase();
    return invoices.filter(inv =>
      (inv.id || '').toLowerCase().includes(q)
      || (inv.status || '').toLowerCase().includes(q)
    );
  }, [invoices, search]);

  // Aggregate stats grouped by currency
  const stats = useMemo(() => {
    const totals = {};
    const dueTotals = {};
    let count = invoices.length;
    for (const inv of invoices) {
      const cur = inv.currency_code || 'USD';
      totals[cur] = (totals[cur] || 0) + (Number(inv.total_amount) || 0);
      if ((inv.status || '').toLowerCase() === 'unpaid' || (inv.status || '').toLowerCase() === 'pending' || (inv.status || '').toLowerCase() === 'overdue') {
        const remaining = (Number(inv.total_amount) || 0) - (Number(inv.paid_amount) || 0);
        dueTotals[cur] = (dueTotals[cur] || 0) + remaining;
      }
    }
    return { totals, dueTotals, count };
  }, [invoices]);

  const downloadPdf = async (invoiceId) => {
    setDownloading(invoiceId);
    try {
      const { url } = await orgService.pcGetInvoicePdfUrl(orgSlug, workspaceId, invoiceId);
      if (url) window.open(url, '_blank', 'noopener');
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err.response?.data?.detail || 'Falha ao obter PDF da fatura.');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-1 inline-flex items-center gap-3">
            <Receipt className="text-blue-500" size={28} /> Faturas Partner Center
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Reconciliação de faturas CSP por cliente — Microsoft 365 e Azure.
          </p>
        </div>
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ['pc-invoices'] })}
          disabled={invoicesQ.isFetching}
          className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-lg text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${invoicesQ.isFetching ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {/* Empty / not configured states */}
      {statusQ.isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : !statusQ.data?.configured ? (
        <div className="card text-center py-12">
          <AlertCircle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">Partner Center não configurado</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Configure as credenciais em <strong>Segurança → Partner Center</strong> para visualizar faturas.
          </p>
        </div>
      ) : !statusQ.data?.token_valid ? (
        <div className="card text-center py-12">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">Token Partner Center inválido</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Reconfigure as credenciais em <strong>Segurança → Partner Center</strong>.
          </p>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
            <div className="card p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
                  <FileText size={18} className="text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.count}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Faturas no período</p>
                </div>
              </div>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-50 dark:bg-green-900/30 flex items-center justify-center">
                  <DollarSign size={18} className="text-green-500" />
                </div>
                <div>
                  {Object.entries(stats.totals).length === 0 ? (
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">—</p>
                  ) : Object.entries(stats.totals).map(([cur, sum]) => (
                    <p key={cur} className="text-lg font-bold text-gray-900 dark:text-gray-100">{fmtCurrency(sum, cur)}</p>
                  ))}
                  <p className="text-xs text-gray-500 dark:text-gray-400">Valor total</p>
                </div>
              </div>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center">
                  <Clock size={18} className="text-amber-500" />
                </div>
                <div>
                  {Object.entries(stats.dueTotals).length === 0 ? (
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">—</p>
                  ) : Object.entries(stats.dueTotals).map(([cur, sum]) => (
                    <p key={cur} className="text-lg font-bold text-gray-900 dark:text-gray-100">{fmtCurrency(sum, cur)}</p>
                  ))}
                  <p className="text-xs text-gray-500 dark:text-gray-400">Em aberto</p>
                </div>
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="card p-3 mb-4">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por ID ou status..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Table */}
          {invoicesQ.isLoading ? (
            <div className="flex justify-center py-16"><LoadingSpinner /></div>
          ) : invoicesQ.isError ? (
            <div className="card text-center py-12">
              <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {invoicesQ.error?.response?.data?.detail || 'Erro ao carregar faturas'}
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="card text-center py-12">
              <FileText className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Nenhuma fatura encontrada.</p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Fatura</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Período</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Vencimento</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Total</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                  {filtered.map(inv => (
                    <tr key={inv.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs text-gray-900 dark:text-gray-100">{inv.id}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">{inv.document_type || '—'}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
                        {fmtDate(inv.billing_period_start)}
                        <span className="mx-1 text-gray-400">→</span>
                        {fmtDate(inv.billing_period_end)}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">{fmtDate(inv.due_date)}</td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-gray-900 dark:text-gray-100">
                        {fmtCurrency(inv.total_amount, inv.currency_code)}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => setSelectedInvoice(inv)}
                            className="p-1.5 rounded text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                            title="Ver detalhes"
                          >
                            <ExternalLink size={14} />
                          </button>
                          <button
                            onClick={() => downloadPdf(inv.id)}
                            disabled={downloading === inv.id}
                            className="p-1.5 rounded text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50 transition-colors"
                            title="Baixar PDF"
                          >
                            {downloading === inv.id ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {selectedInvoice && (
        <InvoiceDrawer
          invoice={selectedInvoice}
          orgSlug={orgSlug}
          workspaceId={workspaceId}
          onClose={() => setSelectedInvoice(null)}
        />
      )}
    </Layout>
  );
}
