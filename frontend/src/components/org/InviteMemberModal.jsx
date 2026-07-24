import { useState } from 'react';
import { X, UserPlus, Shield, Check, Minus, ChevronDown } from 'lucide-react';

const ROLES = [
  {
    value: 'owner',
    label: 'Owner',
    color: 'text-purple-600 dark:text-purple-400',
    bg: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800',
    selectedBg: 'bg-purple-600',
    description: 'Controle total da organização',
    can: [
      'Gerenciar membros e roles',
      'Configurar contas cloud',
      'Criar e excluir workspaces',
      'Visualizar e executar FinOps',
      'Gerenciar orçamentos e alertas',
      'Excluir a organização',
    ],
    cannot: [],
  },
  {
    value: 'admin',
    label: 'Admin',
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    selectedBg: 'bg-blue-600',
    description: 'Gerenciamento completo, sem excluir org',
    can: [
      'Gerenciar membros e roles',
      'Configurar contas cloud',
      'Criar e excluir workspaces',
      'Visualizar e executar FinOps',
      'Gerenciar orçamentos e alertas',
    ],
    cannot: ['Excluir a organização'],
  },
  {
    value: 'operator',
    label: 'Operador',
    color: 'text-green-600 dark:text-green-400',
    bg: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    selectedBg: 'bg-green-600',
    description: 'Opera recursos e executa recomendações',
    can: [
      'Visualizar contas cloud',
      'Criar e gerenciar recursos',
      'Iniciar e parar instâncias',
      'Visualizar custos e logs',
      'Executar recomendações FinOps',
      'Gerenciar templates e webhooks',
    ],
    cannot: ['Gerenciar membros', 'Excluir contas cloud', 'Aprovar orçamentos'],
  },
  {
    value: 'viewer',
    label: 'Visualizador',
    color: 'text-gray-600 dark:text-gray-400',
    bg: 'bg-gray-50 dark:bg-gray-700/30 border-gray-200 dark:border-gray-700',
    selectedBg: 'bg-gray-500',
    description: 'Somente leitura em todos os recursos',
    can: [
      'Visualizar contas cloud',
      'Visualizar recursos e inventário',
      'Visualizar custos',
      'Visualizar logs e alertas',
      'Visualizar recomendações FinOps',
    ],
    cannot: ['Criar ou modificar recursos', 'Gerenciar membros', 'Executar ações'],
  },
  {
    value: 'billing',
    label: 'Faturamento',
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
    selectedBg: 'bg-amber-500',
    description: 'Focado em custos e conformidade financeira',
    can: [
      'Visualizar custos e relatórios',
      'Gerenciar alertas financeiros',
      'Acessar FinOps e recomendações',
      'Visualizar logs de auditoria',
    ],
    cannot: ['Criar ou modificar recursos', 'Gerenciar membros', 'Acessar contas cloud'],
  },
];

export default function InviteMemberModal({ onClose, onSubmit, isLoading, error }) {
  const [email, setEmail]           = useState('');
  const [role, setRole]             = useState('viewer');
  const [phone, setPhone]           = useState('');
  const [department, setDepartment] = useState('');
  const [showRoleDetails, setShowRoleDetails] = useState(false);

  const selectedRole = ROLES.find((r) => r.value === role);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    onSubmit({ email: email.trim(), role, phone: phone.trim() || null, department: department.trim() || null });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <UserPlus className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Adicionar Membro</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Convide alguém para sua organização</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="px-6 py-5 space-y-5">

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@empresa.com"
                required
                autoFocus
                className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm
                           focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              />
              <p className="mt-1 text-xs text-gray-400">
                Se o usuário já tiver conta, será adicionado direto. Caso contrário, receberá um convite.
              </p>
            </div>

            {/* Optional fields */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Celular</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+55 11 99999-9999"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600
                             bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm
                             focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Departamento</label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="Ex: DevOps, TI..."
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600
                             bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm
                             focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                />
              </div>
            </div>

            {/* Role picker */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <Shield className="inline w-3.5 h-3.5 mr-1" />Permissão
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                {ROLES.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => { setRole(r.value); setShowRoleDetails(true); }}
                    className={`py-2 px-1 rounded-xl text-xs font-medium border-2 transition-all ${
                      role === r.value
                        ? `border-2 border-opacity-100 ${r.bg} ${r.color} shadow-sm scale-[1.02]`
                        : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>

              {/* Role details expandable */}
              <div className={`mt-3 rounded-xl border overflow-hidden transition-all ${selectedRole.bg}`}>
                <button
                  type="button"
                  onClick={() => setShowRoleDetails((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-left"
                >
                  <div>
                    <span className={`text-xs font-semibold ${selectedRole.color}`}>{selectedRole.label}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">— {selectedRole.description}</span>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showRoleDetails ? 'rotate-180' : ''}`} />
                </button>

                {showRoleDetails && (
                  <div className="px-4 pb-4 grid grid-cols-1 gap-y-1.5">
                    {selectedRole.can.map((item) => (
                      <div key={item} className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                        <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                        {item}
                      </div>
                    ))}
                    {selectedRole.cannot.map((item) => (
                      <div key={item} className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                        <Minus className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                        {item}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Error */}
            {error && (
              <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!email.trim() || isLoading}
              className="flex items-center gap-2 px-5 py-2 bg-primary text-white rounded-xl text-sm font-medium
                         hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.97]"
            >
              <UserPlus className="w-4 h-4" />
              {isLoading ? 'Enviando...' : 'Convidar Membro'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
