// Hardcoded AWS reference data for form fallbacks when API is unavailable.
// Used by create resource forms as fallbacks when credentials aren't configured yet.

export const AWS_REGIONS = [
  { name: 'us-east-1',      display_name: 'US East (N. Virginia)' },
  { name: 'us-east-2',      display_name: 'US East (Ohio)' },
  { name: 'us-west-1',      display_name: 'US West (N. California)' },
  { name: 'us-west-2',      display_name: 'US West (Oregon)' },
  { name: 'ca-central-1',   display_name: 'Canada (Central)' },
  { name: 'ca-west-1',      display_name: 'Canada West (Calgary)' },
  { name: 'sa-east-1',      display_name: 'South America (São Paulo)' },
  { name: 'eu-west-1',      display_name: 'Europe (Ireland)' },
  { name: 'eu-west-2',      display_name: 'Europe (London)' },
  { name: 'eu-west-3',      display_name: 'Europe (Paris)' },
  { name: 'eu-central-1',   display_name: 'Europe (Frankfurt)' },
  { name: 'eu-central-2',   display_name: 'Europe (Zurich)' },
  { name: 'eu-north-1',     display_name: 'Europe (Stockholm)' },
  { name: 'eu-south-1',     display_name: 'Europe (Milan)' },
  { name: 'eu-south-2',     display_name: 'Europe (Spain)' },
  { name: 'me-south-1',     display_name: 'Middle East (Bahrain)' },
  { name: 'me-central-1',   display_name: 'Middle East (UAE)' },
  { name: 'af-south-1',     display_name: 'Africa (Cape Town)' },
  { name: 'ap-east-1',      display_name: 'Asia Pacific (Hong Kong)' },
  { name: 'ap-south-1',     display_name: 'Asia Pacific (Mumbai)' },
  { name: 'ap-south-2',     display_name: 'Asia Pacific (Hyderabad)' },
  { name: 'ap-northeast-1', display_name: 'Asia Pacific (Tokyo)' },
  { name: 'ap-northeast-2', display_name: 'Asia Pacific (Seoul)' },
  { name: 'ap-northeast-3', display_name: 'Asia Pacific (Osaka)' },
  { name: 'ap-southeast-1', display_name: 'Asia Pacific (Singapore)' },
  { name: 'ap-southeast-2', display_name: 'Asia Pacific (Sydney)' },
  { name: 'ap-southeast-3', display_name: 'Asia Pacific (Jakarta)' },
  { name: 'ap-southeast-4', display_name: 'Asia Pacific (Melbourne)' },
  { name: 'il-central-1',   display_name: 'Israel (Tel Aviv)' },
];

// Common EC2 instance types grouped by family
export const AWS_EC2_INSTANCE_TYPES = [
  // Burstable (T series)
  { name: 't3.nano',     vcpus: 2,  memory_mb: 512,   label: 't3.nano — 2 vCPU, 0.5 GB (Burstable)' },
  { name: 't3.micro',    vcpus: 2,  memory_mb: 1024,  label: 't3.micro — 2 vCPU, 1 GB (Burstable, Free Tier)' },
  { name: 't3.small',    vcpus: 2,  memory_mb: 2048,  label: 't3.small — 2 vCPU, 2 GB (Burstable)' },
  { name: 't3.medium',   vcpus: 2,  memory_mb: 4096,  label: 't3.medium — 2 vCPU, 4 GB (Burstable)' },
  { name: 't3.large',    vcpus: 2,  memory_mb: 8192,  label: 't3.large — 2 vCPU, 8 GB (Burstable)' },
  { name: 't3.xlarge',   vcpus: 4,  memory_mb: 16384, label: 't3.xlarge — 4 vCPU, 16 GB (Burstable)' },
  { name: 't3.2xlarge',  vcpus: 8,  memory_mb: 32768, label: 't3.2xlarge — 8 vCPU, 32 GB (Burstable)' },
  // General Purpose (M series)
  { name: 'm6i.large',   vcpus: 2,  memory_mb: 8192,  label: 'm6i.large — 2 vCPU, 8 GB (General Purpose)' },
  { name: 'm6i.xlarge',  vcpus: 4,  memory_mb: 16384, label: 'm6i.xlarge — 4 vCPU, 16 GB (General Purpose)' },
  { name: 'm6i.2xlarge', vcpus: 8,  memory_mb: 32768, label: 'm6i.2xlarge — 8 vCPU, 32 GB (General Purpose)' },
  { name: 'm6i.4xlarge', vcpus: 16, memory_mb: 65536, label: 'm6i.4xlarge — 16 vCPU, 64 GB (General Purpose)' },
  // Compute Optimized (C series)
  { name: 'c6i.large',   vcpus: 2,  memory_mb: 4096,  label: 'c6i.large — 2 vCPU, 4 GB (Compute Optimized)' },
  { name: 'c6i.xlarge',  vcpus: 4,  memory_mb: 8192,  label: 'c6i.xlarge — 4 vCPU, 8 GB (Compute Optimized)' },
  { name: 'c6i.2xlarge', vcpus: 8,  memory_mb: 16384, label: 'c6i.2xlarge — 8 vCPU, 16 GB (Compute Optimized)' },
  { name: 'c6i.4xlarge', vcpus: 16, memory_mb: 32768, label: 'c6i.4xlarge — 16 vCPU, 32 GB (Compute Optimized)' },
  // Memory Optimized (R series)
  { name: 'r6i.large',   vcpus: 2,  memory_mb: 16384, label: 'r6i.large — 2 vCPU, 16 GB (Memory Optimized)' },
  { name: 'r6i.xlarge',  vcpus: 4,  memory_mb: 32768, label: 'r6i.xlarge — 4 vCPU, 32 GB (Memory Optimized)' },
  { name: 'r6i.2xlarge', vcpus: 8,  memory_mb: 65536, label: 'r6i.2xlarge — 8 vCPU, 64 GB (Memory Optimized)' },
  // Storage Optimized (I series)
  { name: 'i3.large',    vcpus: 2,  memory_mb: 15616, label: 'i3.large — 2 vCPU, 15.25 GB (Storage Optimized, NVMe SSD)' },
  { name: 'i3.xlarge',   vcpus: 4,  memory_mb: 31232, label: 'i3.xlarge — 4 vCPU, 30.5 GB (Storage Optimized, NVMe SSD)' },
  // GPU (G series)
  { name: 'g4dn.xlarge', vcpus: 4,  memory_mb: 16384, label: 'g4dn.xlarge — 4 vCPU, 16 GB, 1 NVIDIA T4 GPU' },
  { name: 'g4dn.2xlarge',vcpus: 8,  memory_mb: 32768, label: 'g4dn.2xlarge — 8 vCPU, 32 GB, 1 NVIDIA T4 GPU' },
];

// Common RDS instance classes by engine family
export const AWS_RDS_INSTANCE_CLASSES = {
  mysql: [
    'db.t3.micro', 'db.t3.small', 'db.t3.medium', 'db.t3.large',
    'db.m6g.large', 'db.m6g.xlarge', 'db.m6g.2xlarge', 'db.m6g.4xlarge',
    'db.r6g.large', 'db.r6g.xlarge', 'db.r6g.2xlarge',
  ],
  postgres: [
    'db.t3.micro', 'db.t3.small', 'db.t3.medium', 'db.t3.large',
    'db.m6g.large', 'db.m6g.xlarge', 'db.m6g.2xlarge', 'db.m6g.4xlarge',
    'db.r6g.large', 'db.r6g.xlarge', 'db.r6g.2xlarge',
  ],
  mariadb: [
    'db.t3.micro', 'db.t3.small', 'db.t3.medium', 'db.t3.large',
    'db.m6g.large', 'db.m6g.xlarge', 'db.m6g.2xlarge',
  ],
  'oracle-ee': [
    'db.t3.small', 'db.t3.medium',
    'db.m5.large', 'db.m5.xlarge', 'db.m5.2xlarge', 'db.m5.4xlarge',
    'db.r5.large', 'db.r5.xlarge', 'db.r5.2xlarge',
  ],
  'sqlserver-ex': [
    'db.t3.small', 'db.t3.medium', 'db.t3.large',
    'db.m5.large', 'db.m5.xlarge', 'db.m5.2xlarge',
    'db.r5.large', 'db.r5.xlarge',
  ],
  'aurora-mysql': [
    'db.t3.medium',
    'db.r6g.large', 'db.r6g.xlarge', 'db.r6g.2xlarge', 'db.r6g.4xlarge',
    'db.r5.large', 'db.r5.xlarge', 'db.r5.2xlarge',
  ],
  'aurora-postgresql': [
    'db.t3.medium',
    'db.r6g.large', 'db.r6g.xlarge', 'db.r6g.2xlarge', 'db.r6g.4xlarge',
    'db.r5.large', 'db.r5.xlarge', 'db.r5.2xlarge',
  ],
};

// Common engine versions
export const AWS_RDS_ENGINE_VERSIONS = {
  mysql: [
    { version: '8.0.36' }, { version: '8.0.35' }, { version: '8.0.34' },
    { version: '5.7.44' }, { version: '5.7.43' },
  ],
  postgres: [
    { version: '16.2' }, { version: '16.1' },
    { version: '15.6' }, { version: '15.5' },
    { version: '14.11' }, { version: '14.10' },
    { version: '13.14' },
  ],
  mariadb: [
    { version: '10.11.7' }, { version: '10.11.6' },
    { version: '10.6.17' }, { version: '10.6.16' },
    { version: '10.5.24' },
  ],
  'oracle-ee': [
    { version: '19.0.0.0.ru-2024-01.rur-2024-01.r1' },
    { version: '21.0.0.0.ru-2024-01.rur-2024-01.r1' },
  ],
  'sqlserver-ex': [
    { version: '15.00.4355.3.v1' }, { version: '14.00.3465.1.v1' },
  ],
  'aurora-mysql': [
    { version: '8.0.mysql_aurora.3.05.2' },
    { version: '8.0.mysql_aurora.3.04.3' },
    { version: '5.7.mysql_aurora.2.12.2' },
  ],
  'aurora-postgresql': [
    { version: '16.2' }, { version: '15.6' }, { version: '14.11' }, { version: '13.14' },
  ],
};
