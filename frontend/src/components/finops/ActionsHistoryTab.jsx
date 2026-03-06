import LoadingSpinner from '../common/loadingspinner';
import ActionTimeline from './ActionTimeline';

const ActionsHistoryTab = ({ actionsQ, onRollback, rollbackId, planTier }) => (
  <div className="space-y-3 animate-fade-in">
    {actionsQ.isLoading ? (
      <div className="flex justify-center py-12"><LoadingSpinner /></div>
    ) : (
      <ActionTimeline
        actions={actionsQ.data?.items || []}
        onRollback={onRollback}
        rollbackLoading={rollbackId}
        planTier={planTier}
      />
    )}
  </div>
);

export default ActionsHistoryTab;
