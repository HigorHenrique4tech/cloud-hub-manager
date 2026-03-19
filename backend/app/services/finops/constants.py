"""
FinOps constants — thresholds, savings multipliers, and pricing ratios.
"""

# ── Thresholds ────────────────────────────────────────────────────────────────

CPU_IDLE_PCT       = 5.0    # % — below this = idle
CPU_UNDERUTIL_PCT  = 20.0   # % — between idle and this = underutilized (rightsizing candidate)
CPU_WINDOW_DAYS    = 7      # days of CloudWatch data
DB_CONNECTIONS_MIN = 5      # avg connections/day below this = idle
DISK_ORPHAN_DAYS   = 7      # days unattached before flagging
IP_UNUSED_DAYS     = 3      # days without association
SNAPSHOT_AGE_DAYS  = 90     # snapshots older than this
LAMBDA_WINDOW_DAYS = 30     # no invocations in this window

# Savings multipliers (fraction of monthly cost saved)
SAVING_RIGHT_SIZE  = 0.50   # right-sizing saves ~50%
SAVING_DELETE      = 1.00   # delete saves 100%
SAVING_STOP        = 0.90   # stop saves ~90% (storage still runs)

# ── Instance family pricing ratios (relative — real pricing varies) ───────────

EC2_FAMILY_RATIO = {
    "nano": 0.25, "micro": 0.5, "small": 1.0, "medium": 2.0,
    "large": 4.0, "xlarge": 8.0, "2xlarge": 16.0, "4xlarge": 32.0,
    "8xlarge": 64.0, "12xlarge": 96.0, "16xlarge": 128.0, "24xlarge": 192.0,
}

AZURE_VM_FAMILY_RATIO = {
    "Standard_B1s": 1.0, "Standard_B1ms": 2.0, "Standard_B2s": 4.0,
    "Standard_B2ms": 8.0, "Standard_D2s_v3": 12.0, "Standard_D4s_v3": 24.0,
    "Standard_D2_v3": 10.0, "Standard_D4_v3": 20.0,
}

# Rough GCE on-demand cost estimates (USD/month)
GCE_COST_MAP = {
    "e2-micro": 6.11, "e2-small": 12.23, "e2-medium": 24.46,
    "e2-standard-2": 48.91, "e2-standard-4": 97.83, "e2-standard-8": 195.65,
    "e2-standard-16": 391.30, "e2-standard-32": 782.61,
    "n1-standard-1": 24.27, "n1-standard-2": 48.54, "n1-standard-4": 97.09,
    "n1-standard-8": 194.18, "n1-standard-16": 388.35,
    "n2-standard-2": 56.35, "n2-standard-4": 112.70, "n2-standard-8": 225.40,
    "n2d-standard-2": 51.63, "n2d-standard-4": 103.26,
    "c2-standard-4": 138.48, "c2-standard-8": 276.95,
}
