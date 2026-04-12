/**
 * VMNetworkSection — seção expandível de rede no drawer da VM
 * Mostra NICs, IPs, Subnet, MAC e regras NSG (inbound/outbound)
 * com destaque para regras perigosas (SSH/RDP aberto para *)
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Network, Shield, ShieldAlert, ShieldOff, ChevronDown, ChevronRight,
  Plus, Trash2, AlertTriangle, CheckCircle2, RefreshCw, X, Globe,
  Lock,
} from 'lucide-react';
import azureService from '../../services/azureservices';
import PermissionGate from '../common/PermissionGate';

// ── Helpers ──────────────────────────────────────────────────────────────────

// Regras que o scanner de segurança marcaria como perigosas
function isDangerousRule(rule) {
  const port = (rule.dest_port || '').toLowerCase();
  const src = (rule.source_address || '').toLowerCase();
  const isDangerPort = ['22', '3389', '*', '0-65535'].includes(port) ||
    port.includes('22') || port.includes('3389');
  const isOpenSource = ['*', 'internet', '0.0.0.0/0', 'any'].includes(src);
  return rule.access === 'Allow' && rule.direction === 'Inbound' && isDangerPort && isOpenSource;
}

const DIRECTION_COLORS = {
  Inbound:  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  Outbound: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
};
const ACCESS_COLORS = {
  Allow: 'text-green-600 dark:text-green-400',
  Deny:  'text-red-600 dark:text-red-400',
};

const inputCls = 'w-full px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-400';
const labelCls = 'block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-0.5';

// ── AddNSGRuleModal ───────────────────────────────────────────────────────────

function AddNSGRuleModal({ nsgRg, nsgName, existingRules, onClose, onSuccess }) {
  const [form, setForm] = useState({
    rule_name: '',
    priority: '',
    direction: 'Inbound',
    access: 'Allow',
    protocol: 'Tcp',
    source_address: '*',
    source_port: '*',
    dest_address: '*',
    dest_port: '',
    description: '',
  });
  const [err, setErr] = useState('');

  // Sugere próxima prioridade disponível
  const usedPriorities = existingRules
    .filter(r => r.direction === form.direction)
    .map(r => r.priority);
  const suggestPriority = () => {
    for (let p = 100; p <= 4000; p += 100) {
      if (!usedPriorities.includes(p)) return p;
    }
    return 4000;
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addMut = useMutation({
    mutationFn: () => azureService.addNSGRule(nsgRg, nsgName, {
      ...form,
      priority: parseInt(form.priority, 10),
    }),
    onSuccess: () => { onSuccess(); onClose(); },
    onError: (e) => setErr(e.response?.data?.detail || e.message),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setErr('');
    if (!form.rule_name.trim()) return setErr('Nome da regra é obrigatório');
    if (!form.dest_port.trim()) return setErr('Porta de destino é obrigatória');
    const p = parseInt(form.priority, 10);
    if (!p || p < 100 || p > 4096) return setErr('Prioridade deve estar entre 100 e 4096');
    addMut.mutate();
  };

  const ADDRESSES = ['*', 'VirtualNetwork', 'AzureLoadBalancer', 'Internet', 'Qualquer IP/CIDR'];
  const PROTOCOLS = ['Tcp', 'Udp', 'Icmp', '*'];
  const QUICK_PORTS = [
    { label: 'HTTP (80)', port: '80' },
    { label: 'HTTPS (443)', port: '443' },
    { label: 'SSH (22)', port: '22' },
    { label: 'RDP (3389)', port: '3389' },
    { label: 'MySQL (3306)', port: '3306' },
    { label: 'SQL Server (1433)', port: '1433' },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg border border-gray-200 dark:border-gray-700 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-sky-50 dark:bg-sky-900/20 flex items-center justify-center">
              <Shield size={16} className="text-sky-500" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Nova Regra NSG</h3>
              <p className="text-[11px] text-gray-400">{nsgName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Nome + Prioridade */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Nome da regra *</label>
              <input value={form.rule_name} onChange={e => set('rule_name', e.target.value)}
                placeholder="Ex: AllowHTTPS" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>
                Prioridade * &nbsp;
                <button type="button" onClick={() => set('priority', String(suggestPriority()))}
                  className="text-sky-500 hover:underline text-[10px]">sugerir</button>
              </label>
              <input type="number" value={form.priority} onChange={e => set('priority', e.target.value)}
                placeholder="100–4096" min={100} max={4096} className={inputCls} />
            </div>
          </div>

          {/* Direção + Ação + Protocolo */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Direção', key: 'direction', opts: ['Inbound', 'Outbound'] },
              { label: 'Ação',    key: 'access',    opts: ['Allow', 'Deny'] },
              { label: 'Protocolo', key: 'protocol', opts: PROTOCOLS },
            ].map(({ label, key, opts }) => (
              <div key={key}>
                <label className={labelCls}>{label}</label>
                <select value={form[key]} onChange={e => set(key, e.target.value)} className={inputCls}>
                  {opts.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            ))}
          </div>

          {/* Porta de destino + atalhos */}
          <div>
            <label className={labelCls}>Porta de destino *</label>
            <input value={form.dest_port} onChange={e => set('dest_port', e.target.value)}
              placeholder="Ex: 443 ou 80-443 ou *" className={inputCls} />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {QUICK_PORTS.map(q => (
                <button key={q.port} type="button"
                  onClick={() => set('dest_port', q.port)}
                  className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${form.dest_port === q.port
                    ? 'bg-sky-500 text-white border-sky-500'
                    : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-sky-400'}`}>
                  {q.label}
                </button>
              ))}
            </div>
          </div>

          {/* Origem */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Endereço de origem</label>
              <input value={form.source_address} onChange={e => set('source_address', e.target.value)}
                placeholder="* ou 10.0.0.0/24" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Porta de origem</label>
              <input value={form.source_port} onChange={e => set('source_port', e.target.value)}
                placeholder="*" className={inputCls} />
            </div>
          </div>

          {/* Destino */}
          <div>
            <label className={labelCls}>Endereço de destino</label>
            <input value={form.dest_address} onChange={e => set('dest_address', e.target.value)}
              placeholder="* ou 10.0.0.0/24" className={inputCls} />
          </div>

          {/* Descrição */}
          <div>
            <label className={labelCls}>Descrição (opcional)</label>
            <input value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="Ex: Permite tráfego HTTPS externo" className={inputCls} />
          </div>

          {/* Aviso regra perigosa */}
          {isDangerousRule({ ...form, dest_port: form.dest_port, direction: form.direction, access: form.access }) && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300">
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
              <p className="text-xs">Esta regra abre porta sensível (SSH/RDP) para qualquer origem. Considere restringir o endereço de origem.</p>
            </div>
          )}

          {err && (
            <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{err}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={addMut.isPending}
              className="flex-1 px-4 py-2 text-sm font-medium rounded-lg bg-sky-500 hover:bg-sky-600 text-white disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
              {addMut.isPending ? <RefreshCw size={13} className="animate-spin" /> : <Plus size={13} />}
              Criar Regra
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── NSGRulesTable ─────────────────────────────────────────────────────────────

function NSGRulesTable({ rules, nsgRg, nsgName, onMutate }) {
  const [confirmDelete, setConfirmDelete] = useState(null);

  const deleteMut = useMutation({
    mutationFn: (ruleName) => azureService.deleteNSGRule(nsgRg, nsgName, ruleName),
    onSuccess: () => { setConfirmDelete(null); onMutate(); },
  });

  if (rules.length === 0) {
    return <p className="text-xs text-gray-400 py-2 text-center">Nenhuma regra configurada.</p>;
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700/50">
            <tr>
              {['Pri', 'Nome', 'Porta Dest.', 'Origem', 'Destino', 'Protocolo', 'Ação', ''].map(h => (
                <th key={h} className="px-2.5 py-2 text-left text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
            {rules.map(rule => {
              const dangerous = isDangerousRule(rule);
              return (
                <tr key={rule.name} className={`transition-colors ${dangerous ? 'bg-red-50/40 dark:bg-red-900/10 hover:bg-red-50 dark:hover:bg-red-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'}`}>
                  <td className="px-2.5 py-2 text-xs font-mono text-gray-700 dark:text-gray-300">{rule.priority}</td>
                  <td className="px-2.5 py-2 text-xs font-medium text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                    {dangerous && <AlertTriangle size={11} className="text-red-500 flex-shrink-0" title="Regra perigosa: porta sensível aberta para qualquer origem" />}
                    {rule.name}
                  </td>
                  <td className="px-2.5 py-2 text-xs font-mono text-gray-600 dark:text-gray-400">{rule.dest_port}</td>
                  <td className="px-2.5 py-2 text-xs text-gray-600 dark:text-gray-400">{rule.source_address}</td>
                  <td className="px-2.5 py-2 text-xs text-gray-600 dark:text-gray-400">{rule.dest_address}</td>
                  <td className="px-2.5 py-2 text-xs text-gray-500 dark:text-gray-400">{rule.protocol}</td>
                  <td className="px-2.5 py-2">
                    <span className={`text-xs font-semibold ${ACCESS_COLORS[rule.access] || 'text-gray-500'}`}>{rule.access}</span>
                  </td>
                  <td className="px-2.5 py-2">
                    <PermissionGate permission="resources.manage">
                      <button
                        onClick={() => setConfirmDelete(rule.name)}
                        className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        title="Excluir regra"
                      >
                        <Trash2 size={12} />
                      </button>
                    </PermissionGate>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Confirmação de exclusão */}
      {confirmDelete && (
        <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 mt-2">
          <p className="text-xs text-red-700 dark:text-red-300">
            Excluir regra <strong>{confirmDelete}</strong>?
          </p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmDelete(null)}
              className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-700">
              Cancelar
            </button>
            <button
              onClick={() => deleteMut.mutate(confirmDelete)}
              disabled={deleteMut.isPending}
              className="text-xs px-2 py-1 rounded bg-red-500 hover:bg-red-600 text-white disabled:opacity-50 flex items-center gap-1">
              {deleteMut.isPending ? <RefreshCw size={10} className="animate-spin" /> : null}
              Excluir
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ── NICCard ───────────────────────────────────────────────────────────────────

function NICCard({ nic, index }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [showInbound, setShowInbound] = useState(true);
  const [showOutbound, setShowOutbound] = useState(false);
  const [showAddRule, setShowAddRule] = useState(false);

  const nicQ = useQuery({
    queryKey: ['azure-nic-detail', nic.resource_group, nic.id],
    queryFn: () => azureService.getNICDetail(nic.resource_group || '', nic.id),
    enabled: expanded && !!nic.resource_group,
    staleTime: 2 * 60_000,
    retry: false,
  });

  const d = nicQ.data;
  const nsgName = d?.nsg?.name || nic.nsg_name || '';
  const nsgRg = d?.nsg?.resource_group || nic.nsg_rg || '';
  const inbound = (d?.nsg_rules || []).filter(r => r.direction === 'Inbound');
  const outbound = (d?.nsg_rules || []).filter(r => r.direction === 'Outbound');
  const dangerCount = (d?.nsg_rules || []).filter(isDangerousRule).length;

  const onMutate = () => qc.invalidateQueries({ queryKey: ['azure-nic-detail', nic.resource_group, nic.id] });

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* NIC Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
      >
        <div className="flex items-center gap-2.5">
          <Network size={14} className="text-sky-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              NIC {index + 1}
              <span className="ml-2 text-xs font-normal text-gray-400">{nic.id}</span>
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {[nic.private_ip, nic.public_ip].filter(Boolean).join(' · ') || 'IPs não resolvidos'}
              {nic.subnet && ` · Subnet: ${nic.subnet}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {dangerCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300">
              <AlertTriangle size={10} /> {dangerCount} risco
            </span>
          )}
          {nsgName ? (
            <span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
              <Shield size={10} /> {nsgName}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
              <ShieldOff size={10} /> Sem NSG
            </span>
          )}
          {expanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 py-4 space-y-4 bg-white dark:bg-gray-800">
          {/* Info grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            {[
              { label: 'IP Privado',    value: nic.private_ip || d?.ip_configurations?.[0]?.private_ip || '—' },
              { label: 'IP Público',    value: nic.public_ip  || d?.ip_configurations?.[0]?.public_ip  || '—' },
              { label: 'Subnet',        value: nic.subnet || d?.ip_configurations?.[0]?.subnet || '—' },
              { label: 'VNet',          value: nic.vnet  || d?.ip_configurations?.[0]?.vnet   || '—' },
              { label: 'MAC',           value: nic.mac_address || d?.mac_address || '—' },
              { label: 'IP Forwarding', value: (nic.enable_ip_forwarding || d?.enable_ip_forwarding) ? 'Ativado' : 'Desativado' },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-[10px] text-gray-400 dark:text-gray-500">{label}</p>
                <p className="font-medium text-gray-800 dark:text-gray-200 font-mono">{value}</p>
              </div>
            ))}
          </div>

          {/* NSG Section */}
          {nicQ.isLoading ? (
            <div className="h-20 rounded-lg bg-gray-100 dark:bg-gray-700 animate-pulse" />
          ) : nsgName ? (
            <div className="space-y-3">
              {/* NSG header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield size={14} className="text-sky-500" />
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{nsgName}</span>
                  {dangerCount > 0 && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300 flex items-center gap-1">
                      <AlertTriangle size={9} /> {dangerCount} regra(s) perigosa(s)
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => nicQ.refetch()} disabled={nicQ.isFetching}
                    className="p-1 rounded text-gray-400 hover:text-sky-500 transition-colors">
                    <RefreshCw size={12} className={nicQ.isFetching ? 'animate-spin' : ''} />
                  </button>
                  <PermissionGate permission="resources.manage">
                    <button
                      onClick={() => setShowAddRule(true)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400 hover:bg-sky-100 dark:hover:bg-sky-900/30 transition-colors"
                    >
                      <Plus size={11} /> Regra
                    </button>
                  </PermissionGate>
                </div>
              </div>

              {/* Inbound */}
              <div>
                <button
                  onClick={() => setShowInbound(v => !v)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
                >
                  {showInbound ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  <Globe size={12} className="text-blue-500" />
                  Regras de Entrada ({inbound.length})
                </button>
                {showInbound && (
                  <NSGRulesTable rules={inbound} nsgRg={nsgRg} nsgName={nsgName} onMutate={onMutate} />
                )}
              </div>

              {/* Outbound */}
              <div>
                <button
                  onClick={() => setShowOutbound(v => !v)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
                >
                  {showOutbound ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  <Lock size={12} className="text-purple-500" />
                  Regras de Saída ({outbound.length})
                </button>
                {showOutbound && (
                  <NSGRulesTable rules={outbound} nsgRg={nsgRg} nsgName={nsgName} onMutate={onMutate} />
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300">
              <ShieldOff size={14} />
              <p className="text-xs font-medium">Nenhum NSG associado a esta NIC. O tráfego de rede não está filtrado.</p>
            </div>
          )}
        </div>
      )}

      {/* Modal para adicionar regra */}
      {showAddRule && nsgName && (
        <AddNSGRuleModal
          nsgRg={nsgRg}
          nsgName={nsgName}
          existingRules={d?.nsg_rules || []}
          onClose={() => setShowAddRule(false)}
          onSuccess={onMutate}
        />
      )}
    </div>
  );
}

// ── VMNetworkSection (export principal) ───────────────────────────────────────

export default function VMNetworkSection({ networkInterfaces = [] }) {
  if (networkInterfaces.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500 py-2">
        <Network size={14} />
        Nenhuma interface de rede encontrada.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {networkInterfaces.map((nic, i) => (
        <NICCard key={nic.id || i} nic={nic} index={i} />
      ))}
    </div>
  );
}
