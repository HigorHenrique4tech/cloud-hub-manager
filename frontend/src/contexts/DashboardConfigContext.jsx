import { createContext, useContext } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { arrayMove } from '@dnd-kit/sortable';
import dashboardConfigService from '../services/dashboardConfigService';
import { useOrgWorkspace } from './OrgWorkspaceContext';

export const DEFAULT_WIDGETS = [
  { id: 'stats',     visible: true,  order: 0 },
  { id: 'cost',      visible: true,  order: 1 },
  { id: 'finops',    visible: true,  order: 2 },
  { id: 'alerts',    visible: false, order: 3 },
  { id: 'schedules', visible: false, order: 4 },
  { id: 'activity',  visible: true,  order: 5 },
];

export const WIDGET_META = {
  stats:     { label: 'Estatísticas Cloud' },
  cost:      { label: 'Custo & Forecast' },
  finops:    { label: 'Resumo FinOps' },
  alerts:    { label: 'Alertas de Custo' },
  schedules: { label: 'Próximos Agendamentos' },
  activity:  { label: 'Atividade Recente' },
};

const DashboardConfigContext = createContext(null);

export const DashboardConfigProvider = ({ children }) => {
  const { currentWorkspace } = useOrgWorkspace();
  const queryClient = useQueryClient();

  const { data: config } = useQuery({
    queryKey: ['dashboard-config', currentWorkspace?.id],
    queryFn: dashboardConfigService.getConfig,
    enabled: Boolean(currentWorkspace),
    staleTime: Infinity,
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: dashboardConfigService.saveConfig,
    onSuccess: (data) => {
      queryClient.setQueryData(['dashboard-config', currentWorkspace?.id], data);
    },
  });

  const widgets = config?.widgets ?? DEFAULT_WIDGETS;

  const visibleWidgets = [...widgets]
    .filter((w) => w.visible)
    .sort((a, b) => a.order - b.order);

  const allWidgets = [...widgets].sort((a, b) => a.order - b.order);

  const toggleWidget = (id) => {
    const updated = widgets.map((w) =>
      w.id === id ? { ...w, visible: !w.visible } : w
    );
    saveMutation.mutate(updated);
  };

  const reorderWidgets = (newVisible) => {
    const hidden = widgets.filter((w) => !w.visible);
    const merged = [
      ...newVisible.map((w, i) => ({ ...w, order: i })),
      ...hidden.map((w, i) => ({ ...w, order: newVisible.length + i })),
    ];
    saveMutation.mutate(merged);
  };

  const resetConfig = () => saveMutation.mutate(DEFAULT_WIDGETS);

  return (
    <DashboardConfigContext.Provider
      value={{
        widgets,
        visibleWidgets,
        allWidgets,
        toggleWidget,
        reorderWidgets,
        resetConfig,
        isSaving: saveMutation.isPending,
      }}
    >
      {children}
    </DashboardConfigContext.Provider>
  );
};

export const useDashboardConfig = () => {
  const ctx = useContext(DashboardConfigContext);
  if (!ctx) throw new Error('useDashboardConfig must be used inside DashboardConfigProvider');
  return ctx;
};
