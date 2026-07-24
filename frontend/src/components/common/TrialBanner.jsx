import { Clock, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useOrgWorkspace } from '../../contexts/OrgWorkspaceContext';

const TrialBanner = () => {
  const navigate = useNavigate();
  const { currentOrg } = useOrgWorkspace();
  const trial = currentOrg?.trial;

  // Only show while trial is actively running on a free-tier org
  if (!trial?.trial_active || (currentOrg?.plan_tier || 'free') !== 'free') return null;

  const days = trial.days_remaining;
  const urgent = days <= 7;
  const warning = days <= 14 && days > 7;

  return (
    <div className={`w-full px-4 py-2 flex items-center justify-between text-sm font-medium ${
      urgent
        ? 'bg-red-500 text-white'
        : warning
          ? 'bg-amber-400 text-amber-900'
          : 'bg-primary/90 text-white'
    }`}>
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4" />
        <span>
          {days === 0
            ? 'Último dia do seu trial!'
            : days === 1
              ? 'Seu trial termina amanhã'
              : `Seu trial termina em ${days} dias`}
        </span>
      </div>
      <button
        onClick={() => navigate('/billing')}
        className={`flex items-center gap-1 px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
          urgent
            ? 'bg-white text-red-600 hover:bg-red-50'
            : warning
              ? 'bg-amber-900 text-white hover:bg-amber-800'
              : 'bg-white text-primary hover:bg-gray-100'
        }`}
      >
        Assinar agora
        <ArrowRight className="w-3 h-3" />
      </button>
    </div>
  );
};

export default TrialBanner;
