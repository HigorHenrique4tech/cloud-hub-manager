import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { Settings, Cloud } from 'lucide-react';
import Layout from '../components/layout/layout';
import LoadingSpinner from '../components/common/loadingspinner';
import SortableWidget from '../components/dashboard/SortableWidget';
import DashboardCustomizer from '../components/dashboard/DashboardCustomizer';
import StatsWidget from '../components/dashboard/widgets/StatsWidget';
import CostWidget from '../components/dashboard/widgets/CostWidget';
import FinOpsWidget from '../components/dashboard/widgets/FinOpsWidget';
import AlertsWidget from '../components/dashboard/widgets/AlertsWidget';
import SchedulesWidget from '../components/dashboard/widgets/SchedulesWidget';
import ActivityWidget from '../components/dashboard/widgets/ActivityWidget';
import {
  DashboardConfigProvider,
  useDashboardConfig,
} from '../contexts/DashboardConfigContext';
import awsService from '../services/awsservices';
import azureService from '../services/azureservices';
import orgService from '../services/orgService';
import { useOrgWorkspace } from '../contexts/OrgWorkspaceContext';

/* ── Widget registry ───────────────────────────────────────── */
const WIDGET_COMPONENTS = {
  stats:     <StatsWidget />,
  cost:      <CostWidget />,
  finops:    <FinOpsWidget />,
  alerts:    <AlertsWidget />,
  schedules: <SchedulesWidget />,
  activity:  <ActivityWidget />,
};

/* ── Empty state ──────────────────────────────────────────── */
const EmptyWorkspaceState = () => {
  const navigate = useNavigate();
  return (
    <Layout>
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
          <Cloud className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
          Nenhuma conta cloud configurada
        </h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm max-w-md mb-6">
          Este workspace não possui contas AWS ou Azure. Adicione suas credenciais cloud para começar a monitorar recursos e custos.
        </p>
        <button
          onClick={() => navigate('/workspace/settings')}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-lg font-medium hover:bg-primary-dark transition-colors"
        >
          <Settings className="w-4 h-4" />
          Configurar Workspace
        </button>
      </div>
    </Layout>
  );
};

/* ── Dashboard inner (uses context) ──────────────────────── */
const DashboardInner = () => {
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const { visibleWidgets, reorderWidgets } = useDashboardConfig();
  const { currentOrg, currentWorkspace } = useOrgWorkspace();
  const wsReady = !!currentOrg && !!currentWorkspace;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  /* Check for empty workspace (no cloud accounts) */
  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ['dashboard-accounts', currentOrg?.slug, currentWorkspace?.id],
    queryFn: () => orgService.listAccounts(currentOrg.slug, currentWorkspace.id),
    enabled: wsReady,
    retry: false,
    staleTime: 60 * 1000,
  });

  const accounts = accountsData?.accounts || accountsData || [];
  const uniqueProviders = [...new Set(accounts.map((a) => a.provider))];
  const hasAws   = uniqueProviders.includes('aws');
  const hasAzure = uniqueProviders.includes('azure');

  /* Loading indicator while cloud provider data arrives */
  const { isLoading: awsLoading }   = useQuery({
    queryKey: ['dashboard-aws'],
    queryFn: () => awsService.listEC2Instances(),
    enabled: wsReady && hasAws,
    retry: false,
  });
  const { isLoading: azureLoading } = useQuery({
    queryKey: ['dashboard-azure'],
    queryFn: () => azureService.listVMs(),
    enabled: wsReady && hasAzure,
    retry: false,
  });

  /* Empty workspace state */
  if (wsReady && accountsData && accounts.length === 0) {
    return <EmptyWorkspaceState />;
  }

  if (accountsLoading || (awsLoading && hasAws) || (azureLoading && hasAzure)) {
    return <Layout><LoadingSpinner text="Carregando recursos..." /></Layout>;
  }

  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIdx = visibleWidgets.findIndex((w) => w.id === active.id);
    const newIdx = visibleWidgets.findIndex((w) => w.id === over.id);
    reorderWidgets(arrayMove(visibleWidgets, oldIdx, newIdx));
  };

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">Dashboard</h1>
        <button
          onClick={() => setCustomizerOpen(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 transition-colors"
        >
          <Settings className="w-4 h-4" />
          Personalizar
        </button>
      </div>

      {/* Draggable widgets */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={visibleWidgets.map((w) => w.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-5">
            {visibleWidgets.map((w) => (
              <SortableWidget key={w.id} id={w.id}>
                {WIDGET_COMPONENTS[w.id]}
              </SortableWidget>
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <DashboardCustomizer
        isOpen={customizerOpen}
        onClose={() => setCustomizerOpen(false)}
      />
    </Layout>
  );
};

/* ── Public export — wraps with provider ────────────────────── */
const Dashboard = () => (
  <DashboardConfigProvider>
    <DashboardInner />
  </DashboardConfigProvider>
);

export default Dashboard;
