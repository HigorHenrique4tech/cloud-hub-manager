import { useState } from 'react';
import {
  X, Shield, Phone, Building2, StickyNote, Calendar, Mail,
  Check, Minus, Pencil, Save, Trash2, ChevronDown, ChevronUp,
} from 'lucide-react';

const ROLES = [
  {
    value: 'owner',
    label: 'Owner',
    color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
    ring: 'ring-purple-400',
  },
  {
    value: 'admin',
    label: 'Admin',
    color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    ring: 'ring-blue-400',
  },
  {
    value: 'operator',
    label: 'Operador',
    color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    ring: 'ring-green-400',
  },
  {
    value: 'viewer',
    label: 'Visualizador',
    color: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
    ring: 'ring-gray-400',
  },
  {
    value: 'billing',
    label: 'Faturamento',
    color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
    ring: 'ring-amber-400',
  },
];

const ALL_PERMISSIONS = [
  { key: 'org.settings', label: 'Configurações da org', roles: ['owner', 'admin'] },
  { key: 'org.members', label: 'Gerenciar membros', roles: ['owner', 'admin'] },
  { key: 'org.delete', label: 'Excluir organização', roles: ['owner'] },
  { key: 'workspace', label: 'Criar/editar workspaces', roles: ['owner', 'admin'] },
  { key: 'accounts', label: 'Contas cloud (criar/excluir)', roles: ['owner', 'admin'] },
  { key: 'accounts.view', label: 'Visualizar contas cloud', roles: ['owner', 'admin', 'operator', 'viewer'] },
  { key: 'resources.create', label: 'Criar recursos', roles: ['owner', 'admin', 'operator'] },
  { key: 'resources.start_stop', label: 'Iniciar/Parar recursos', roles: ['owner', 'admin', 'operator'] },
  { key: 'resources.view', label: 'Visualizar recursos', roles: ['owner', 'admin', 'operator', 'viewer'] },
  { key: 'schedules.manage', label: 'Gerenciar agendamentos', roles: ['owner', 'admin', 'operator'] },
  { key: 'schedules.view', label: 'Visualizar agendamentos', roles: ['owner', 'admin', 'operator', 'viewer', 'billing'] },
  { key: 'costs.view', label: 'Visualizar custos', roles: ['owner', 'admin', 'operator', 'viewer', 'billing'] },
  { key: 'finops.execute', label: 'Executar FinOps', roles: ['owner', 'admin'] },
  { key: 'finops.recommend', label: 'Recomendações FinOps', roles: ['owner', 'admin', 'operator', 'billing'] },
  { key: 'finops.view', label: 'Visualizar FinOps', roles: ['owner', 'admin', 'operator', 'viewer', 'billing'] },
  { key: 'finops.budget', label: 'Gerenciar orçamentos', roles: ['owner', 'admin', 'billing'] },
  { key: 'alerts.manage', label: 'Gerenciar alertas', roles: ['owner', 'admin', 'operator', 'billing'] },
  { key: 'alerts.view', label: 'Visualizar alertas', roles: ['owner', 'admin', 'operator', 'viewer', 'billing'] },
  { key: 'logs.view', label: 'Logs de auditoria', roles: ['owner', 'admin', 'operator', 'viewer', 'billing'] },
  { key: 'templates', label: 'Gerenciar templates', roles: ['owner', 'admin', 'operator'] },
  { key: 'webhooks', label: 'Gerenciar webhooks', roles: ['owner', 'admin', 'operator'] },
  { key: 'm365.manage', label: 'M365 Admin', roles: ['owner', 'admin', 'operator'] },
  { key: 'm365.view', label: 'Visualizar M365', roles: ['owner', 'admin', 'operator', 'viewer', 'billing'] },
];

function Avatar({ name, size = 'lg' }) {
  const initials = (name || '?')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  const colors = [
    'bg-blue-500', 'bg-purple-500', 'bg-green-500',
    'bg-amber-500', 'bg-rose-500', 'bg-cyan-500',
  ];
  const color = colors[(name || '').charCodeAt(0) % colors.length];
  const sz = size === 'lg' ? 'w-14 h-14 text-xl' : 'w-8 h-8 text-sm';
  return (
    <div className={`${sz} ${color} rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0`}>
      {initials}
    </div>
  );
}

function RoleBadge({ role }) {
  const r = ROLES.find((x) => x.value === role) || ROLES[3];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${r.color}`}>
      <Shield className="w-3 h-3" /> {r.label}
    </span>
  );
}

export default function MemberDetailDrawer({
  member,
  onClose,
  onUpdate,
  onRemove,
  isUpdating,
  isRemoving,
  canManage,
}) {
  const [editMode, setEditMode]         = useState(false);
  const [phone, setPhone]               = useState(member.phone || '');
  const [department, setDepartment]     = useState(member.department || '');
  const [notes, setNotes]               = useState(member.notes || '');
  const [role, setRole]                 = useState(member.role);
  const [showPerms, setShowPerms]       = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const roleInfo = ROLES.find((r) => r.value === role) || ROLES[3];
  const joinedDate = member.joined_at
    ? new Date(member.joined_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : '—';

  const handleSave = () => {
    onUpdate({
      role: role !== member.role ? role : undefined,
      phone: phone.trim() || null,
      department: department.trim() || null,
      notes: notes.trim() || null,
    });
    setEditMode(false);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white dark:bg-gray-800
                      shadow-2xl border-l border-gray-200 dark:border-gray-700 flex flex-col
                      animate-in slide-in-from-right duration-200">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Detalhes do Membro</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">

          {/* Profile hero */}
          <div className="px-6 py-6 flex items-start gap-4 border-b border-gray-100 dark:border-gray-700">
            <Avatar name={member.name} size="lg" />
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">
                {member.name || 'Sem nome'}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{member.email}</p>
              <div className="mt-2">
                <RoleBadge role={role} />
              </div>
            </div>
          </div>

          {/* Info fields */}
          <div className="px-6 py-5 space-y-4">

            {/* Email */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Mail className="w-4 h-4 text-gray-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-400 mb-0.5">Email</p>
                <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{member.email}</p>
              </div>
            </div>

            {/* Phone */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Phone className="w-4 h-4 text-gray-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-400 mb-0.5">Celular</p>
                {editMode ? (
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+55 11 99999-9999"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600
                               bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100
                               focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                ) : (
                  <p className="text-sm text-gray-800 dark:text-gray-200">{member.phone || <span className="text-gray-400 italic">Não informado</span>}</p>
                )}
              </div>
            </div>

            {/* Department */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Building2 className="w-4 h-4 text-gray-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-400 mb-0.5">Departamento</p>
                {editMode ? (
                  <input
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="Ex: DevOps, TI, Financeiro..."
                    className="w-full px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600
                               bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100
                               focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                ) : (
                  <p className="text-sm text-gray-800 dark:text-gray-200">{member.department || <span className="text-gray-400 italic">Não informado</span>}</p>
                )}
              </div>
            </div>

            {/* Joined at */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Calendar className="w-4 h-4 text-gray-400" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-400 mb-0.5">Membro desde</p>
                <p className="text-sm text-gray-800 dark:text-gray-200">{joinedDate}</p>
              </div>
            </div>

            {/* Notes */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                <StickyNote className="w-4 h-4 text-gray-400" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-400 mb-0.5">Observações</p>
                {editMode ? (
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Notas internas sobre este membro..."
                    rows={3}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600
                               bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100
                               focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                  />
                ) : (
                  <p className="text-sm text-gray-800 dark:text-gray-200">
                    {member.notes || <span className="text-gray-400 italic">Nenhuma observação</span>}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Role section */}
          {canManage && (
            <div className="px-6 pb-5">
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5" /> Permissão / Role
                </p>
                {editMode ? (
                  <div className="grid grid-cols-1 gap-1.5">
                    {ROLES.map((r) => (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => setRole(r.value)}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm border-2 transition-all ${
                          role === r.value
                            ? `border-primary/60 ${r.color}`
                            : 'border-transparent hover:border-gray-200 dark:hover:border-gray-600 text-gray-600 dark:text-gray-400'
                        }`}
                      >
                        <div className={`w-2 h-2 rounded-full ${role === r.value ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'}`} />
                        <span className="font-medium">{r.label}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <RoleBadge role={role} />
                )}
              </div>
            </div>
          )}

          {/* Permissions list */}
          <div className="px-6 pb-6">
            <button
              type="button"
              onClick={() => setShowPerms((v) => !v)}
              className="w-full flex items-center justify-between text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2"
            >
              <span>Permissões detalhadas</span>
              {showPerms ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showPerms && (
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                {ALL_PERMISSIONS.map((p, i) => {
                  const hasIt = p.roles.includes(role);
                  return (
                    <div
                      key={p.key}
                      className={`flex items-center justify-between px-4 py-2.5 text-xs ${
                        i < ALL_PERMISSIONS.length - 1 ? 'border-b border-gray-100 dark:border-gray-700' : ''
                      }`}
                    >
                      <span className={hasIt ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'}>
                        {p.label}
                      </span>
                      {hasIt ? (
                        <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                      ) : (
                        <Minus className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 flex-shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer actions */}
        {canManage && (
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 space-y-3">
            {editMode ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setEditMode(false); setPhone(member.phone || ''); setDepartment(member.department || ''); setNotes(member.notes || ''); setRole(member.role); }}
                  className="flex-1 py-2 text-sm text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={isUpdating}
                  className="flex-1 flex items-center justify-center gap-2 py-2 bg-primary text-white text-sm font-medium rounded-xl
                             hover:bg-primary/90 disabled:opacity-50 transition-all active:scale-[0.97]"
                >
                  <Save className="w-4 h-4" />
                  {isUpdating ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEditMode(true)}
                className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium text-gray-700 dark:text-gray-300
                           border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <Pencil className="w-4 h-4" /> Editar informações
              </button>
            )}

            {!confirmRemove ? (
              <button
                onClick={() => setConfirmRemove(true)}
                className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium text-red-600 dark:text-red-400
                           border border-red-200 dark:border-red-900/40 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <Trash2 className="w-4 h-4" /> Remover da organização
              </button>
            ) : (
              <div className="rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/10 p-3 space-y-2">
                <p className="text-xs text-red-700 dark:text-red-300 text-center">
                  Remover <strong>{member.name || member.email}</strong> da organização?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmRemove(false)}
                    className="flex-1 py-1.5 text-xs text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={onRemove}
                    disabled={isRemoving}
                    className="flex-1 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50 transition-colors"
                  >
                    {isRemoving ? 'Removendo...' : 'Sim, remover'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
