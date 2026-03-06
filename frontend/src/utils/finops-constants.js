/* ── FinOps — Constantes compartilhadas ──────────────────────────────────── */

export const TIMEZONES = [
  'America/Sao_Paulo', 'America/New_York', 'America/Chicago',
  'America/Denver', 'America/Los_Angeles', 'Europe/London',
  'Europe/Paris', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Singapore',
  'Australia/Sydney', 'UTC',
];

export const SCHED_TYPES = [
  { value: 'daily',    label: 'Diário' },
  { value: 'weekdays', label: 'Seg–Sex' },
  { value: 'weekends', label: 'Sáb–Dom' },
];

export const WEEK_DAYS = [
  { value: 0, label: 'Segunda-feira' },
  { value: 1, label: 'Terça-feira' },
  { value: 2, label: 'Quarta-feira' },
  { value: 3, label: 'Quinta-feira' },
  { value: 4, label: 'Sexta-feira' },
  { value: 5, label: 'Sábado' },
  { value: 6, label: 'Domingo' },
];

export const REPORT_TIMEZONES = [
  'America/Sao_Paulo', 'America/New_York', 'America/Chicago',
  'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'UTC',
];

export const FILTER_STATUS   = ['pending', 'applied', 'dismissed'];
export const FILTER_PROVIDER = ['aws', 'azure', 'gcp'];

export const TABS = [
  { id: 'recommendations', label: 'Recomendações', icon: 'TrendingDown' },
  { id: 'budgets',         label: 'Orçamentos',     icon: 'Wallet' },
  { id: 'reports',         label: 'Relatórios',     icon: 'Mail' },
  { id: 'anomalies',       label: 'Anomalias',      icon: 'Bell' },
  { id: 'actions',         label: 'Histórico',      icon: 'History' },
];
