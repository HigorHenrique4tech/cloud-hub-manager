/**
 * Hardcoded Azure reference data (from Microsoft documentation).
 * Used as fallback when Azure API credentials are not yet configured.
 */

// ── Azure Regions ─────────────────────────────────────────────────────────────
export const AZURE_LOCATIONS = [
  // Americas
  { name: 'brazilsouth',        display_name: 'Brazil South (São Paulo)' },
  { name: 'eastus',             display_name: 'East US (Virginia)' },
  { name: 'eastus2',            display_name: 'East US 2 (Virginia)' },
  { name: 'westus',             display_name: 'West US (California)' },
  { name: 'westus2',            display_name: 'West US 2 (Washington)' },
  { name: 'westus3',            display_name: 'West US 3 (Arizona)' },
  { name: 'centralus',          display_name: 'Central US (Iowa)' },
  { name: 'northcentralus',     display_name: 'North Central US (Illinois)' },
  { name: 'southcentralus',     display_name: 'South Central US (Texas)' },
  { name: 'canadacentral',      display_name: 'Canada Central (Toronto)' },
  { name: 'canadaeast',         display_name: 'Canada East (Quebec)' },
  // Europe
  { name: 'westeurope',         display_name: 'West Europe (Netherlands)' },
  { name: 'northeurope',        display_name: 'North Europe (Ireland)' },
  { name: 'uksouth',            display_name: 'UK South (London)' },
  { name: 'ukwest',             display_name: 'UK West (Cardiff)' },
  { name: 'francecentral',      display_name: 'France Central (Paris)' },
  { name: 'germanywestcentral', display_name: 'Germany West Central (Frankfurt)' },
  { name: 'switzerlandnorth',   display_name: 'Switzerland North (Zurich)' },
  { name: 'norwayeast',         display_name: 'Norway East (Oslo)' },
  { name: 'swedencentral',      display_name: 'Sweden Central (Gävle)' },
  // Asia Pacific
  { name: 'eastasia',           display_name: 'East Asia (Hong Kong)' },
  { name: 'southeastasia',      display_name: 'Southeast Asia (Singapore)' },
  { name: 'australiaeast',      display_name: 'Australia East (New South Wales)' },
  { name: 'australiasoutheast', display_name: 'Australia Southeast (Victoria)' },
  { name: 'japaneast',          display_name: 'Japan East (Tokyo)' },
  { name: 'japanwest',          display_name: 'Japan West (Osaka)' },
  { name: 'koreacentral',       display_name: 'Korea Central (Seoul)' },
  { name: 'southindia',         display_name: 'South India (Chennai)' },
  { name: 'centralindia',       display_name: 'Central India (Pune)' },
  // Middle East & Africa
  { name: 'uaenorth',           display_name: 'UAE North (Dubai)' },
  { name: 'southafricanorth',   display_name: 'South Africa North (Johannesburg)' },
];

// ── VM Sizes ──────────────────────────────────────────────────────────────────
// Source: https://learn.microsoft.com/pt-br/azure/virtual-machines/sizes
export const AZURE_VM_SIZES = [
  // B-series (Burstable — dev/test, small workloads)
  { name: 'Standard_B1s',   vcpus: 1,  memory_mb: 1024,  label: 'Standard_B1s — 1 vCPU, 1 GB (Burstable)' },
  { name: 'Standard_B1ms',  vcpus: 1,  memory_mb: 2048,  label: 'Standard_B1ms — 1 vCPU, 2 GB (Burstable)' },
  { name: 'Standard_B2s',   vcpus: 2,  memory_mb: 4096,  label: 'Standard_B2s — 2 vCPU, 4 GB (Burstable)' },
  { name: 'Standard_B2ms',  vcpus: 2,  memory_mb: 8192,  label: 'Standard_B2ms — 2 vCPU, 8 GB (Burstable)' },
  { name: 'Standard_B4ms',  vcpus: 4,  memory_mb: 16384, label: 'Standard_B4ms — 4 vCPU, 16 GB (Burstable)' },
  { name: 'Standard_B8ms',  vcpus: 8,  memory_mb: 32768, label: 'Standard_B8ms — 8 vCPU, 32 GB (Burstable)' },
  // D-series v3 (General Purpose)
  { name: 'Standard_D2s_v3', vcpus: 2, memory_mb: 8192,  label: 'Standard_D2s_v3 — 2 vCPU, 8 GB (General Purpose)' },
  { name: 'Standard_D4s_v3', vcpus: 4, memory_mb: 16384, label: 'Standard_D4s_v3 — 4 vCPU, 16 GB (General Purpose)' },
  { name: 'Standard_D8s_v3', vcpus: 8, memory_mb: 32768, label: 'Standard_D8s_v3 — 8 vCPU, 32 GB (General Purpose)' },
  // D-series v4
  { name: 'Standard_D2s_v4', vcpus: 2, memory_mb: 8192,  label: 'Standard_D2s_v4 — 2 vCPU, 8 GB (General Purpose v4)' },
  { name: 'Standard_D4s_v4', vcpus: 4, memory_mb: 16384, label: 'Standard_D4s_v4 — 4 vCPU, 16 GB (General Purpose v4)' },
  // D-series v5
  { name: 'Standard_D2s_v5', vcpus: 2, memory_mb: 8192,  label: 'Standard_D2s_v5 — 2 vCPU, 8 GB (General Purpose v5)' },
  { name: 'Standard_D4s_v5', vcpus: 4, memory_mb: 16384, label: 'Standard_D4s_v5 — 4 vCPU, 16 GB (General Purpose v5)' },
  { name: 'Standard_D8s_v5', vcpus: 8, memory_mb: 32768, label: 'Standard_D8s_v5 — 8 vCPU, 32 GB (General Purpose v5)' },
  // E-series (Memory Optimized)
  { name: 'Standard_E2s_v3', vcpus: 2, memory_mb: 16384, label: 'Standard_E2s_v3 — 2 vCPU, 16 GB (Memory Optimized)' },
  { name: 'Standard_E4s_v3', vcpus: 4, memory_mb: 32768, label: 'Standard_E4s_v3 — 4 vCPU, 32 GB (Memory Optimized)' },
  { name: 'Standard_E8s_v3', vcpus: 8, memory_mb: 65536, label: 'Standard_E8s_v3 — 8 vCPU, 64 GB (Memory Optimized)' },
  // F-series (Compute Optimized)
  { name: 'Standard_F2s_v2', vcpus: 2, memory_mb: 4096,  label: 'Standard_F2s_v2 — 2 vCPU, 4 GB (Compute Optimized)' },
  { name: 'Standard_F4s_v2', vcpus: 4, memory_mb: 8192,  label: 'Standard_F4s_v2 — 4 vCPU, 8 GB (Compute Optimized)' },
  { name: 'Standard_F8s_v2', vcpus: 8, memory_mb: 16384, label: 'Standard_F8s_v2 — 8 vCPU, 16 GB (Compute Optimized)' },
];

// ── VM OS Image Presets ───────────────────────────────────────────────────────
// Source: https://learn.microsoft.com/pt-br/azure/virtual-machines/windows/quick-create-portal
// Each preset sets publisher + offer + sku + version in one click
export const VM_OS_PRESETS = [
  // Ubuntu
  {
    label: 'Ubuntu 24.04 LTS',
    group: 'Linux — Ubuntu',
    publisher: 'Canonical',
    offer: 'ubuntu-24_04-lts',
    sku: 'server',
    version: 'latest',
  },
  {
    label: 'Ubuntu 22.04 LTS (Jammy)',
    group: 'Linux — Ubuntu',
    publisher: 'Canonical',
    offer: '0001-com-ubuntu-server-jammy',
    sku: '22_04-lts-gen2',
    version: 'latest',
  },
  {
    label: 'Ubuntu 20.04 LTS (Focal)',
    group: 'Linux — Ubuntu',
    publisher: 'Canonical',
    offer: '0001-com-ubuntu-server-focal',
    sku: '20_04-lts-gen2',
    version: 'latest',
  },
  // Windows Server
  {
    label: 'Windows Server 2022 Datacenter',
    group: 'Windows Server',
    publisher: 'MicrosoftWindowsServer',
    offer: 'WindowsServer',
    sku: '2022-datacenter-g2',
    version: 'latest',
  },
  {
    label: 'Windows Server 2022 Datacenter (Core)',
    group: 'Windows Server',
    publisher: 'MicrosoftWindowsServer',
    offer: 'WindowsServer',
    sku: '2022-datacenter-core-g2',
    version: 'latest',
  },
  {
    label: 'Windows Server 2019 Datacenter',
    group: 'Windows Server',
    publisher: 'MicrosoftWindowsServer',
    offer: 'WindowsServer',
    sku: '2019-datacenter-gensecond',
    version: 'latest',
  },
  {
    label: 'Windows Server 2016 Datacenter',
    group: 'Windows Server',
    publisher: 'MicrosoftWindowsServer',
    offer: 'WindowsServer',
    sku: '2016-datacenter-gensecond',
    version: 'latest',
  },
  // Red Hat
  {
    label: 'RHEL 9.2 (Red Hat Enterprise Linux)',
    group: 'Linux — Red Hat',
    publisher: 'RedHat',
    offer: 'RHEL',
    sku: '9_2',
    version: 'latest',
  },
  {
    label: 'RHEL 8.9 (Red Hat Enterprise Linux)',
    group: 'Linux — Red Hat',
    publisher: 'RedHat',
    offer: 'RHEL',
    sku: '8_9',
    version: 'latest',
  },
  // Debian
  {
    label: 'Debian 12 (Bookworm)',
    group: 'Linux — Debian',
    publisher: 'Debian',
    offer: 'debian-12',
    sku: '12',
    version: 'latest',
  },
  {
    label: 'Debian 11 (Bullseye)',
    group: 'Linux — Debian',
    publisher: 'Debian',
    offer: 'debian-11',
    sku: '11',
    version: 'latest',
  },
  // SUSE
  {
    label: 'SUSE Linux Enterprise Server 15 SP5',
    group: 'Linux — SUSE',
    publisher: 'SUSE',
    offer: 'sles-15-sp5',
    sku: 'gen2',
    version: 'latest',
  },
  // Custom
  {
    label: 'Personalizado (insira manualmente)',
    group: 'Personalizado',
    publisher: '',
    offer: '',
    sku: '',
    version: 'latest',
  },
];
