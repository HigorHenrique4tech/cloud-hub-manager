import { Mail, Plus, Pencil, CheckCircle, XCircle } from 'lucide-react';
import LoadingSpinner from '../common/loadingspinner';
import PlanGate from '../common/PlanGate';
import PermissionGate from '../common/PermissionGate';
import { WEEK_DAYS } from '../../utils/finops-constants';

const ReportsTab = ({ reportScheduleQ, onOpenModal }) => (
  <div className="space-y-4 animate-fade-in">
    <PlanGate minPlan="pro" feature="Relatórios Automáticos">
      {reportScheduleQ.isLoading ? (
        <div className="flex justify-center py-12"><LoadingSpinner /></div>
      ) : (
        <div className="max-w-xl">
          {reportScheduleQ.data?.schedule ? (
            <div className="rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800/60 p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/20">
                    <Mail size={18} className="text-primary-light" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                      {reportScheduleQ.data.schedule.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-slate-400">
                      {reportScheduleQ.data.schedule.schedule_type === 'weekly'
                        ? `Semanal · ${WEEK_DAYS.find((d) => d.value === reportScheduleQ.data.schedule.send_day)?.label ?? ''}`
                        : `Mensal · Dia ${reportScheduleQ.data.schedule.send_day}`
                      }
                      {' '}às {reportScheduleQ.data.schedule.send_time} · {reportScheduleQ.data.schedule.timezone}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    reportScheduleQ.data.schedule.is_enabled
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-400'
                  }`}>
                    {reportScheduleQ.data.schedule.is_enabled ? 'Ativo' : 'Inativo'}
                  </span>
                  <PermissionGate permission="finops.budget">
                    <button
                      onClick={onOpenModal}
                      className="text-gray-400 hover:text-primary-light transition-colors"
                      title="Editar"
                    >
                      <Pencil size={14} />
                    </button>
                  </PermissionGate>
                </div>
              </div>

              {/* Recipients */}
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-slate-400 mb-1.5">Destinatários</p>
                <div className="flex flex-wrap gap-1.5">
                  {(reportScheduleQ.data.schedule.recipients ?? []).map((e) => (
                    <span key={e} className="rounded-full bg-gray-100 dark:bg-slate-700 px-2 py-0.5 text-xs text-gray-600 dark:text-slate-300">
                      {e}
                    </span>
                  ))}
                </div>
              </div>

              {/* Sections */}
              <div className="flex gap-3 flex-wrap">
                {[
                  { key: 'include_costs',   label: 'Custos' },
                  { key: 'include_budgets', label: 'Orçamentos' },
                  { key: 'include_finops',  label: 'FinOps' },
                ].map(({ key, label }) => (
                  <span
                    key={key}
                    className={`inline-flex items-center gap-1 text-xs ${
                      reportScheduleQ.data.schedule[key]
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-gray-400 dark:text-slate-500 line-through'
                    }`}
                  >
                    <CheckCircle size={11} />
                    {label}
                  </span>
                ))}
              </div>

              {/* Last run */}
              {reportScheduleQ.data.schedule.last_run_at && (
                <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-slate-500">
                  {reportScheduleQ.data.schedule.last_run_status === 'success'
                    ? <CheckCircle size={11} className="text-green-400" />
                    : <XCircle size={11} className="text-red-400" />}
                  Último envio: {new Date(reportScheduleQ.data.schedule.last_run_at).toLocaleString('pt-BR')}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-slate-500">
              <Mail size={40} className="mb-3 opacity-20" />
              <p className="text-base font-medium">Nenhum relatório agendado</p>
              <p className="text-sm mt-1 mb-4">Configure o envio automático de resumos por email</p>
              <PermissionGate permission="finops.budget">
                <button
                  onClick={onOpenModal}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark transition-colors active:scale-[0.97]"
                >
                  <Plus size={16} />
                  Configurar Relatório
                </button>
              </PermissionGate>
            </div>
          )}
        </div>
      )}
    </PlanGate>
  </div>
);

export default ReportsTab;
