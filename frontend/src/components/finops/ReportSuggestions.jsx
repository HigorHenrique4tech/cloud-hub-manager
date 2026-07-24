import { AlertTriangle, Info, CheckCircle2 } from 'lucide-react';

const fmtUSD = (v) =>
  v == null ? '—' : `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const generateSuggestions = (data, days) => {
  const suggestions = [];
  const total = data.total || 0;
  if (total === 0) return suggestions;

  const services = data.by_service || [];

  const computeSvcs = services.filter((s) => /EC2|Compute|Virtual Machine|VMs?/i.test(s.name));
  const computeTotal = computeSvcs.reduce((a, s) => a + s.amount, 0);
  if (computeTotal / total > 0.35) {
    suggestions.push({
      type: 'warning', icon: AlertTriangle,
      title: 'Alto gasto em computação',
      description: `${((computeTotal / total) * 100).toFixed(0)}% do custo (${fmtUSD(computeTotal)}) está em instâncias de computação. Considere Reserved Instances ou Savings Plans para economizar até 60%.`,
      saving: computeTotal * 0.4,
    });
  }

  const storageSvcs = services.filter((s) => /S3|Storage|Blob|Disk/i.test(s.name));
  const storageTotal = storageSvcs.reduce((a, s) => a + s.amount, 0);
  if (storageTotal / total > 0.20) {
    suggestions.push({
      type: 'info', icon: Info,
      title: 'Custo de armazenamento elevado',
      description: `${fmtUSD(storageTotal)} em armazenamento (${((storageTotal / total) * 100).toFixed(0)}% do total). Políticas de ciclo de vida, compressão e camadas inteligentes podem reduzir até 40%.`,
      saving: storageTotal * 0.3,
    });
  }

  const transferSvcs = services.filter((s) => /Data Transfer|Bandwidth|Egress|Network/i.test(s.name));
  const transferTotal = transferSvcs.reduce((a, s) => a + s.amount, 0);
  if (transferTotal / total > 0.10) {
    suggestions.push({
      type: 'info', icon: Info,
      title: 'Custo de transferência de dados',
      description: `${fmtUSD(transferTotal)} em transferência de dados. Use CDN (CloudFront/Akamai), VPC endpoints e revise o tráfego inter-regiões para reduzir até 25%.`,
      saving: transferTotal * 0.25,
    });
  }

  const dbSvcs = services.filter((s) => /RDS|SQL|Database|Aurora|Cosmos/i.test(s.name));
  const dbTotal = dbSvcs.reduce((a, s) => a + s.amount, 0);
  if (dbTotal / total > 0.20) {
    suggestions.push({
      type: 'warning', icon: AlertTriangle,
      title: 'Alto custo em bancos de dados',
      description: `${fmtUSD(dbTotal)} em banco de dados. Avalie Aurora Serverless, Reserved Instances para RDS ou migração para DynamoDB onde aplicável.`,
      saving: dbTotal * 0.35,
    });
  }

  const activeProviders = [data.aws && 'AWS', data.azure && 'Azure', data.gcp && 'GCP'].filter(Boolean);
  if (activeProviders.length === 1) {
    suggestions.push({
      type: 'info', icon: Info,
      title: 'Dependência de único provedor',
      description: `Todo o gasto está concentrado em ${activeProviders[0]}. Avaliar outros provedores para workloads específicos pode aumentar resiliência e abrir negociação de volume.`,
      saving: null,
    });
  }

  const avgDaily = total / days;
  if (avgDaily > 200) {
    suggestions.push({
      type: 'success', icon: CheckCircle2,
      title: 'Implantar tagging e alocação de custos',
      description: `Com gasto médio de ${fmtUSD(avgDaily)}/dia, tags de ambiente (prod/dev/staging) permitem identificar e eliminar recursos desnecessários em ambientes de desenvolvimento.`,
      saving: avgDaily * 0.10 * 30,
    });
  }

  const top1 = services[0];
  if (top1 && top1.amount / total > 0.60) {
    suggestions.push({
      type: 'warning', icon: AlertTriangle,
      title: 'Concentração excessiva em um serviço',
      description: `"${top1.name}" representa ${((top1.amount / total) * 100).toFixed(0)}% do custo total. Revisar dimensionamento e utilização deste serviço deve ser prioridade.`,
      saving: top1.amount * 0.15,
    });
  }

  return suggestions.slice(0, 5);
};

const STYLES = {
  warning: { border: 'border-amber-200 dark:border-amber-800', bg: 'bg-amber-50 dark:bg-amber-900/20', icon: 'text-amber-600 dark:text-amber-400', title: 'text-amber-800 dark:text-amber-300' },
  info:    { border: 'border-blue-200 dark:border-blue-800',   bg: 'bg-blue-50 dark:bg-blue-900/20',   icon: 'text-blue-600 dark:text-blue-400',   title: 'text-blue-800 dark:text-blue-300' },
  success: { border: 'border-green-200 dark:border-green-800', bg: 'bg-green-50 dark:bg-green-900/20', icon: 'text-green-600 dark:text-green-400', title: 'text-green-800 dark:text-green-300' },
};

const SuggestionCard = ({ suggestion }) => {
  const { icon: Icon, type, title, description, saving } = suggestion;
  const s = STYLES[type] || { border: 'border-gray-200', bg: 'bg-gray-50', icon: 'text-gray-600', title: 'text-gray-800' };
  return (
    <div className={`flex gap-3 p-3 rounded-lg border ${s.border} ${s.bg}`}>
      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${s.icon}`} />
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${s.title}`}>{title}</p>
        <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">{description}</p>
        {saving != null && (
          <p className="text-xs text-green-700 dark:text-green-400 font-medium mt-1.5">
            Economia potencial estimada: ~{fmtUSD(saving)}/mês
          </p>
        )}
      </div>
    </div>
  );
};

const ReportSuggestions = ({ suggestions, totalSaving }) => {
  if (!suggestions.length) return null;
  return (
    <div>
      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1 flex items-center gap-2">
        <span className="w-4 h-4 text-yellow-500">💡</span>
        Sugestões de Otimização
      </h2>
      {totalSaving > 0 && (
        <p className="text-sm text-green-600 dark:text-green-400 mb-3">
          Economia potencial total estimada: <strong>{fmtUSD(totalSaving)}/mês</strong>
        </p>
      )}
      <div className="space-y-3">
        {suggestions.map((s, i) => <SuggestionCard key={i} suggestion={s} />)}
      </div>
    </div>
  );
};

export default ReportSuggestions;
