import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DollarSign, Info, TrendingUp, Tag, Wifi, WifiOff } from 'lucide-react';
import pricingService from '../../services/pricingService';

// ── Static fallback tables (us-east-1 / East US, On-Demand, Linux) ───────────
// Used instantly while the live API call is in flight, and as backup on error.

const EC2_HOURLY = {
  't2.micro':0.0116,'t2.small':0.023,'t2.medium':0.0464,'t2.large':0.0928,'t2.xlarge':0.1856,'t2.2xlarge':0.3712,
  't3.nano':0.0052,'t3.micro':0.0104,'t3.small':0.0208,'t3.medium':0.0416,'t3.large':0.0832,'t3.xlarge':0.1664,'t3.2xlarge':0.3328,
  't3a.micro':0.0094,'t3a.small':0.0188,'t3a.medium':0.0376,'t3a.large':0.0752,'t3a.xlarge':0.1504,
  'm5.large':0.096,'m5.xlarge':0.192,'m5.2xlarge':0.384,'m5.4xlarge':0.768,'m5.8xlarge':1.536,
  'm6i.large':0.096,'m6i.xlarge':0.192,'m6i.2xlarge':0.384,'m6i.4xlarge':0.768,
  'm6a.large':0.0864,'m6a.xlarge':0.1728,'m6a.2xlarge':0.3456,
  'c5.large':0.085,'c5.xlarge':0.17,'c5.2xlarge':0.34,'c5.4xlarge':0.68,'c5.9xlarge':1.53,
  'c6i.large':0.085,'c6i.xlarge':0.17,'c6i.2xlarge':0.34,'c6i.4xlarge':0.68,
  'r5.large':0.126,'r5.xlarge':0.252,'r5.2xlarge':0.504,'r5.4xlarge':1.008,
  'r6i.large':0.126,'r6i.xlarge':0.252,'r6i.2xlarge':0.504,
  'p3.2xlarge':3.06,'p3.8xlarge':12.24,'p3.16xlarge':24.48,
  'g4dn.xlarge':0.526,'g4dn.2xlarge':0.752,'g4dn.4xlarge':1.204,
};
const EBS_PER_GB = { gp2:0.10, gp3:0.08, io1:0.125, io2:0.125, st1:0.045, sc1:0.025 };
const EC2_WINDOWS_EXTRA = {
  't2.micro':0.010,'t2.small':0.013,'t2.medium':0.019,'t2.large':0.040,'t2.xlarge':0.080,'t2.2xlarge':0.160,
  't3.nano':0.003,'t3.micro':0.006,'t3.small':0.012,'t3.medium':0.009,'t3.large':0.018,'t3.xlarge':0.040,'t3.2xlarge':0.080,
  't3a.micro':0.006,'t3a.small':0.012,'t3a.medium':0.009,'t3a.large':0.018,'t3a.xlarge':0.040,
  'm5.large':0.096,'m5.xlarge':0.192,'m5.2xlarge':0.384,'m5.4xlarge':0.768,'m5.8xlarge':1.536,
  'm6i.large':0.096,'m6i.xlarge':0.192,'m6i.2xlarge':0.384,'m6i.4xlarge':0.768,
  'm6a.large':0.086,'m6a.xlarge':0.173,'m6a.2xlarge':0.346,
  'c5.large':0.085,'c5.xlarge':0.170,'c5.2xlarge':0.340,'c5.4xlarge':0.680,'c5.9xlarge':1.530,
  'c6i.large':0.085,'c6i.xlarge':0.170,'c6i.2xlarge':0.340,'c6i.4xlarge':0.680,
  'r5.large':0.126,'r5.xlarge':0.252,'r5.2xlarge':0.504,'r5.4xlarge':1.008,
  'r6i.large':0.126,'r6i.xlarge':0.252,'r6i.2xlarge':0.504,
};
const RDS_HOURLY = {
  'db.t3.micro':0.017,'db.t3.small':0.034,'db.t3.medium':0.068,'db.t3.large':0.136,'db.t3.xlarge':0.272,
  'db.t4g.micro':0.016,'db.t4g.small':0.032,'db.t4g.medium':0.064,'db.t4g.large':0.128,'db.t4g.xlarge':0.256,
  'db.m5.large':0.171,'db.m5.xlarge':0.342,'db.m5.2xlarge':0.684,'db.m5.4xlarge':1.368,
  'db.m6g.large':0.163,'db.m6g.xlarge':0.325,'db.m6g.2xlarge':0.650,
  'db.r5.large':0.24,'db.r5.xlarge':0.48,'db.r5.2xlarge':0.96,'db.r5.4xlarge':1.92,
  'db.r6g.large':0.228,'db.r6g.xlarge':0.456,'db.r6g.2xlarge':0.912,
};
const RDS_STORAGE  = { gp2:0.115, gp3:0.115, io1:0.125 };
const RDS_SQL_EXTRA = {
  'db.t3.micro':0.028,'db.t3.small':0.024,'db.t3.medium':0.047,'db.t3.large':0.094,'db.t3.xlarge':0.188,
  'db.m5.large':0.292,'db.m5.xlarge':0.584,'db.m5.2xlarge':1.168,'db.m5.4xlarge':2.336,
  'db.m6g.large':0.278,'db.m6g.xlarge':0.556,'db.m6g.2xlarge':1.112,
  'db.r5.large':0.448,'db.r5.xlarge':0.896,'db.r5.2xlarge':1.792,'db.r5.4xlarge':3.584,
  'db.r6g.large':0.427,'db.r6g.xlarge':0.854,'db.r6g.2xlarge':1.708,
};
const RDS_ORA_EXTRA = {
  'db.t3.micro':0.108,'db.t3.small':0.144,'db.t3.medium':0.225,'db.t3.large':0.450,'db.t3.xlarge':0.900,
  'db.m5.large':0.444,'db.m5.xlarge':0.888,'db.m5.2xlarge':1.776,'db.m5.4xlarge':3.552,
  'db.r5.large':0.624,'db.r5.xlarge':1.248,'db.r5.2xlarge':2.496,'db.r5.4xlarge':4.992,
};
const AZURE_VM_HOURLY = {
  'Standard_B1ls':0.0052,'Standard_B1s':0.0092,'Standard_B1ms':0.0207,
  'Standard_B2s':0.0368,'Standard_B2ms':0.0832,'Standard_B4ms':0.1664,'Standard_B8ms':0.3328,'Standard_B16ms':0.6656,
  'Standard_D2s_v3':0.096,'Standard_D4s_v3':0.192,'Standard_D8s_v3':0.384,'Standard_D16s_v3':0.768,
  'Standard_D2s_v4':0.096,'Standard_D4s_v4':0.192,'Standard_D8s_v4':0.384,
  'Standard_D2s_v5':0.096,'Standard_D4s_v5':0.192,'Standard_D8s_v5':0.384,
  'Standard_D2as_v5':0.0868,'Standard_D4as_v5':0.1736,'Standard_D8as_v5':0.3472,
  'Standard_E2s_v3':0.126,'Standard_E4s_v3':0.252,'Standard_E8s_v3':0.504,'Standard_E16s_v3':1.008,
  'Standard_E2s_v5':0.126,'Standard_E4s_v5':0.252,'Standard_E8s_v5':0.504,
  'Standard_F2s_v2':0.085,'Standard_F4s_v2':0.169,'Standard_F8s_v2':0.338,'Standard_F16s_v2':0.677,
  'Standard_NC6':0.90,'Standard_NC12':1.80,'Standard_NC24':3.60,
};
const AZURE_DISK_PGB = {
  'Standard_LRS':0.04,'StandardSSD_LRS':0.075,'Premium_LRS':0.135,'UltraSSD_LRS':0.25,
};
const AZURE_WIN_EXTRA = {
  'Standard_B1ls':0.004,'Standard_B1s':0.009,'Standard_B1ms':0.020,
  'Standard_B2s':0.037,'Standard_B2ms':0.083,'Standard_B4ms':0.166,'Standard_B8ms':0.332,'Standard_B16ms':0.666,
  'Standard_D2s_v3':0.096,'Standard_D4s_v3':0.192,'Standard_D8s_v3':0.384,'Standard_D16s_v3':0.768,
  'Standard_D2s_v4':0.096,'Standard_D4s_v4':0.192,'Standard_D8s_v4':0.384,
  'Standard_D2s_v5':0.096,'Standard_D4s_v5':0.192,'Standard_D8s_v5':0.384,
  'Standard_E2s_v3':0.126,'Standard_E4s_v3':0.252,'Standard_E8s_v3':0.504,'Standard_E16s_v3':1.008,
  'Standard_F2s_v2':0.085,'Standard_F4s_v2':0.169,'Standard_F8s_v2':0.338,'Standard_F16s_v2':0.677,
};
const AZURE_SQL_MONTHLY = {
  'Basic':4.99,'S0':14.72,'S1':29.43,'S2':58.87,'S3':117.73,'S4':235.47,
  'P1':465.08,'P2':930.16,'P4':1860.31,
  'GP_Gen5_2':185.67,'GP_Gen5_4':371.34,'GP_Gen5_8':742.68,'GP_Gen5_16':1485.36,
  'BC_Gen5_2':557.60,'BC_Gen5_4':1115.20,'BC_Gen5_8':2230.40,
};
const AZURE_APP_MONTHLY = {
  'F1':0,'D1':9.49,'B1':12.41,'B2':24.82,'B3':49.64,
  'S1':56.94,'S2':113.88,'S3':227.76,
  'P1v2':67.16,'P2v2':134.32,'P3v2':268.64,
  'P1v3':80.52,'P2v3':161.04,'P3v3':322.08,
};

const HOURS = 730;

// ── Static compute ─────────────────────────────────────────────────────────────

function computeStatic(type, form) {
  if (type === 'ec2') {
    const rate = EC2_HOURLY[form.instance_type];
    if (!rate) return null;
    const items = [{ label: `Compute (${form.instance_type})`, amount: rate * HOURS }];
    (form.volumes || []).forEach(v => {
      const gb = v.volume_size_gb || 8;
      items.push({ label: `EBS ${v.volume_type || 'gp2'} (${gb} GB)`, amount: gb * (EBS_PER_GB[v.volume_type] ?? 0.10) });
    });
    if (form.image_platform === 'windows') {
      const extra = EC2_WINDOWS_EXTRA[form.instance_type];
      if (extra) items.push({ label: 'Licença Windows Server', amount: extra * HOURS, isLicense: true });
    }
    const monthly = items.reduce((s, i) => s + i.amount, 0);
    return { monthly, hourly: monthly / HOURS, items, source: 'static' };
  }

  if (type === 'rds') {
    const engine = form.engine || 'mysql';
    const rate = RDS_HOURLY[form.db_instance_class];
    if (!rate) return null;
    let compute = rate * HOURS;
    if (form.multi_az) compute *= 2;
    const gb = form.allocated_storage_gb || form.allocated_storage || 20;
    const storage = gb * (RDS_STORAGE[form.storage_type] ?? 0.115);
    const az = form.multi_az ? ', Multi-AZ' : '';
    const items = [
      { label: `Instância (${form.db_instance_class}${az})`, amount: compute },
      { label: `Storage ${form.storage_type || 'gp2'} (${gb} GB)`, amount: storage },
    ];
    if (engine.startsWith('sqlserver')) {
      const e = RDS_SQL_EXTRA[form.db_instance_class];
      if (e) items.push({ label: 'Licença SQL Server (License Included)', amount: e * HOURS * (form.multi_az ? 2 : 1), isLicense: true });
    } else if (engine.startsWith('oracle')) {
      const e = RDS_ORA_EXTRA[form.db_instance_class];
      if (e) items.push({ label: 'Licença Oracle EE (License Included)', amount: e * HOURS * (form.multi_az ? 2 : 1), isLicense: true });
    }
    const monthly = items.reduce((s, i) => s + i.amount, 0);
    return { monthly, hourly: monthly / HOURS, items, source: 'static' };
  }

  if (type === 'azure-vm') {
    const rate = AZURE_VM_HOURLY[form.vm_size];
    if (!rate) return null;
    const diskGb = form.os_disk_size_gb || 128;
    const items = [
      { label: `VM (${form.vm_size})`, amount: rate * HOURS },
      { label: `OS Disk ${form.os_disk_type || 'Standard_LRS'} (${diskGb} GB)`, amount: diskGb * (AZURE_DISK_PGB[form.os_disk_type] ?? 0.04) },
    ];
    (form.data_disks || []).forEach((d, i) => {
      const sz = d.disk_size_gb || d.size_gb || 128;
      const tp = d.storage_account_type || d.type || 'Standard_LRS';
      items.push({ label: `Data Disk ${i + 1} (${sz} GB)`, amount: sz * (AZURE_DISK_PGB[tp] ?? 0.04) });
    });
    const isWin = form.image_publisher === 'MicrosoftWindowsServer' || /windows/i.test(form.image_offer || '');
    if (isWin) {
      const extra = AZURE_WIN_EXTRA[form.vm_size];
      if (extra) items.push({ label: 'Licença Windows Server', amount: extra * HOURS, isLicense: true });
    }
    const monthly = items.reduce((s, i) => s + i.amount, 0);
    return { monthly, hourly: monthly / HOURS, items, source: 'static' };
  }

  if (type === 'azure-sql') {
    const monthly = AZURE_SQL_MONTHLY[form.sku_name];
    if (monthly == null) return null;
    return { monthly, hourly: monthly / HOURS, items: [{ label: `Azure SQL Database (${form.sku_name})`, amount: monthly }], source: 'static' };
  }

  if (type === 'azure-app-service') {
    const monthly = AZURE_APP_MONTHLY[form.plan_sku];
    if (monthly == null) return null;
    return { monthly, hourly: monthly / HOURS, items: [{ label: `App Service Plan (${form.plan_sku})`, amount: monthly }], source: 'static' };
  }

  return null;
}

// ── Determine if a live API call is worth making ──────────────────────────────

function shouldFetchLive(type, form) {
  if (type === 'ec2')            return !!form.instance_type;
  if (type === 'rds')            return !!form.db_instance_class;
  if (type === 'azure-vm')       return !!form.vm_size;
  return false; // azure-sql and azure-app-service use static tables
}

// ── Component ─────────────────────────────────────────────────────────────────

const CostEstimatePanel = ({ type, form }) => {
  // Debounce form changes to avoid firing the API on every keystroke
  const [debounced, setDebounced] = useState(form);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(form), 700);
    return () => clearTimeout(id);
  }, [JSON.stringify(form)]); // eslint-disable-line react-hooks/exhaustive-deps

  const staticEstimate = computeStatic(type, form);

  const { data: liveEstimate, isFetching } = useQuery({
    queryKey: ['pricing-estimate', type, JSON.stringify(debounced)],
    queryFn:  () => pricingService.getEstimate(type, debounced),
    enabled:  shouldFetchLive(type, debounced),
    staleTime: 24 * 60 * 60 * 1000,
    gcTime:    24 * 60 * 60 * 1000,
    retry: false,
    // On error, fall silently through to staticEstimate
  });

  // Prefer live data; show static while loading or on error
  const estimate = liveEstimate ?? staticEstimate;
  const isLive   = !!liveEstimate;

  if (!estimate) return null;

  const { monthly, hourly, items } = estimate;
  const isFree       = monthly === 0;
  const hasLicense   = items.some(i => i.isLicense);

  return (
    <div className="border-t border-dashed border-gray-200 dark:border-gray-700 pt-5 mt-2">
      <div className="rounded-xl overflow-hidden border border-emerald-200 dark:border-emerald-800 shadow-sm">

        {/* Header */}
        <div className={`px-5 py-4 ${isFree ? 'bg-gradient-to-r from-emerald-500 to-teal-500' : 'bg-gradient-to-r from-emerald-600 to-teal-600'} text-white`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                <DollarSign className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-medium opacity-80 uppercase tracking-wide">Estimativa de Custo</p>
                <p className="text-xs opacity-60">
                  {hasLicense ? 'Infraestrutura + Licenciamento' : 'Baseado em preços de referência'}
                </p>
              </div>
            </div>
            <div className="text-right">
              {isFree ? (
                <div className="text-2xl font-bold">Gratuito</div>
              ) : (
                <>
                  <div className="text-2xl font-bold">
                    ~${monthly.toFixed(2)}<span className="text-sm font-normal opacity-75">/mês</span>
                  </div>
                  <div className="text-xs opacity-70 flex items-center gap-1 justify-end mt-0.5">
                    <TrendingUp className="w-3 h-3" />
                    ~${hourly.toFixed(4)}/hora
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Breakdown */}
        <div className="bg-white dark:bg-gray-800/50 px-5 py-3 space-y-2">
          {items.map((item, i) => (
            <div key={i} className="flex items-center justify-between">
              <span className={`text-sm flex items-center gap-1.5 ${item.isLicense ? 'text-amber-700 dark:text-amber-400' : 'text-gray-600 dark:text-gray-400'}`}>
                {item.isLicense
                  ? <Tag className="w-3.5 h-3.5 flex-shrink-0" />
                  : <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                }
                {item.label}
              </span>
              <span className={`text-sm font-semibold ${
                item.amount === 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : item.isLicense
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-gray-900 dark:text-gray-100'
              }`}>
                {item.amount === 0 ? 'Grátis' : `$${item.amount.toFixed(2)}`}
              </span>
            </div>
          ))}

          {items.length > 1 && (
            <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Total</span>
              <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                {monthly === 0 ? '$0.00' : `~$${monthly.toFixed(2)}`}/mês
              </span>
            </div>
          )}
        </div>

        {/* Footer — source badge + disclaimer */}
        <div className="px-5 py-2.5 bg-emerald-50 dark:bg-emerald-950/30 border-t border-emerald-100 dark:border-emerald-900 flex items-start justify-between gap-3">
          <p className="text-xs text-emerald-700 dark:text-emerald-400 flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            {isLive
              ? `Preços reais ${estimate.region ? `(${estimate.region})` : ''}, On-Demand. Licenças via License Included.`
              : 'Valores estimados (us-east-1 / East US, On-Demand). Preços reais variam por região.'
            }
          </p>

          {/* Source badge */}
          <div className={`flex items-center gap-1 flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
            isFetching
              ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
              : isLive
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
          }`}>
            {isFetching
              ? <><span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />Atualizando</>
              : isLive
                ? <><Wifi className="w-3 h-3" />Tempo real</>
                : <><WifiOff className="w-3 h-3" />Estimado</>
            }
          </div>
        </div>
      </div>
    </div>
  );
};

export default CostEstimatePanel;
