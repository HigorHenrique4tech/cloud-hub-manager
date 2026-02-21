import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, Plus, Zap } from 'lucide-react';
import Layout from '../components/layout/layout';
import PlanGate from '../components/common/PlanGate';
import PermissionGate from '../components/common/PermissionGate';
import ScheduleCard from '../components/schedules/ScheduleCard';
import ScheduleFormModal from '../components/schedules/ScheduleFormModal';
import scheduleService from '../services/scheduleService';
import { useOrgWorkspace } from '../contexts/OrgWorkspaceContext';

const PLAN_ORDER = { free: 0, pro: 1, enterprise: 2 };

const Schedules = () => {
  const { currentOrg, currentWorkspace } = useOrgWorkspace();
  const plan = (currentOrg?.plan_tier || 'free').toLowerCase();
  const isPro = (PLAN_ORDER[plan] ?? 0) >= 1;

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);

  const { data: schedules = [], isLoading, error } = useQuery({
    queryKey: ['schedules', currentWorkspace?.id],
    queryFn: () => scheduleService.getSchedules(),
    enabled: isPro && Boolean(currentWorkspace),
  });

  const awsSchedules   = schedules.filter((s) => s.provider === 'aws');
  const azureSchedules = schedules.filter((s) => s.provider === 'azure');

  const openCreate = () => { setEditTarget(null); setModalOpen(true); };
  const openEdit = (s) => { setEditTarget(s); setModalOpen(true); };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-indigo-600/20 p-2">
              <Clock size={20} className="text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-100">Agendamentos</h1>
              <p className="text-sm text-slate-400">
                Ligar e desligar recursos automaticamente por horário
              </p>
            </div>
          </div>

          <PermissionGate permission="resources.start_stop">
            <button
              onClick={openCreate}
              disabled={!isPro}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Plus size={16} />
              Novo
            </button>
          </PermissionGate>
        </div>

        {/* Plan gate */}
        {!isPro && (
          <PlanGate minPlan="pro" feature="Agendamentos de recursos">
            <span />
          </PlanGate>
        )}

        {isPro && (
          <>
            {isLoading && (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-red-700/40 bg-red-900/20 px-4 py-3 text-sm text-red-300">
                Erro ao carregar agendamentos: {error?.response?.data?.detail || error.message}
              </div>
            )}

            {!isLoading && !error && schedules.length === 0 && (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-700 bg-slate-900/40 py-14 text-center">
                <Zap size={28} className="text-slate-500" />
                <p className="text-sm font-medium text-slate-300">Nenhum agendamento configurado</p>
                <p className="text-xs text-slate-500 max-w-xs">
                  Use o FinOps para detectar candidatos automaticamente, ou clique em{' '}
                  <span className="text-slate-300">"Novo"</span> para criar manualmente.
                </p>
                <PermissionGate permission="resources.start_stop">
                  <button
                    onClick={openCreate}
                    className="mt-1 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors"
                  >
                    Criar agendamento
                  </button>
                </PermissionGate>
              </div>
            )}

            {/* AWS group */}
            {awsSchedules.length > 0 && (
              <section className="space-y-2">
                <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-orange-400">
                  <span className="rounded bg-orange-500/20 px-1.5 py-0.5">AWS</span>
                  {awsSchedules.length} agendamento{awsSchedules.length > 1 ? 's' : ''}
                </h2>
                <div className="space-y-2">
                  {awsSchedules.map((s) => (
                    <ScheduleCard key={s.id} schedule={s} onEdit={() => openEdit(s)} />
                  ))}
                </div>
              </section>
            )}

            {/* Azure group */}
            {azureSchedules.length > 0 && (
              <section className="space-y-2">
                <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sky-400">
                  <span className="rounded bg-sky-500/20 px-1.5 py-0.5">Azure</span>
                  {azureSchedules.length} agendamento{azureSchedules.length > 1 ? 's' : ''}
                </h2>
                <div className="space-y-2">
                  {azureSchedules.map((s) => (
                    <ScheduleCard key={s.id} schedule={s} onEdit={() => openEdit(s)} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      <ScheduleFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        initialData={editTarget}
      />
    </Layout>
  );
};

export default Schedules;
