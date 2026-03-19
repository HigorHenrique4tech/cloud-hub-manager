"""
FinOps utility functions — severity classification, right-sizing helpers,
and anomaly detection.
"""
from statistics import mean, stdev
from typing import List, Optional

from .constants import EC2_FAMILY_RATIO, SAVING_RIGHT_SIZE


def _severity(saving: float) -> str:
    if saving >= 50:
        return "high"
    if saving >= 10:
        return "medium"
    return "low"


def _right_size_saving(current_type: str, current_cost: float) -> tuple[float, str]:
    """
    Returns (estimated_monthly_saving, recommended_type).
    Tries to downgrade one size within the same family.
    """
    parts = current_type.split(".")
    if len(parts) == 2:
        family, size = parts
        sizes = list(EC2_FAMILY_RATIO.keys())
        current_idx = next((i for i, s in enumerate(sizes) if s == size), None)
        if current_idx and current_idx > 0:
            rec_size = sizes[current_idx - 1]
            ratio = EC2_FAMILY_RATIO[rec_size] / EC2_FAMILY_RATIO[size]
            saving = current_cost * (1 - ratio)
            return saving, f"{family}.{rec_size}"
    # fallback: estimate 50% saving with no specific recommendation
    return current_cost * SAVING_RIGHT_SIZE, "menor instância da mesma família"


def detect_cost_anomalies(daily_costs: List[float], service_name: str, provider: str) -> Optional[dict]:
    """
    Given a time-ordered list of daily costs for a service, detect if the last
    2 days show a statistically significant spike (> baseline + 3σ).

    Returns anomaly dict or None.
    """
    if len(daily_costs) < 5:
        return None

    baseline_data = daily_costs[:-2]
    if len(baseline_data) < 3:
        return None

    baseline = mean(baseline_data)
    try:
        sigma = stdev(baseline_data)
    except Exception:
        sigma = 0

    threshold = baseline + 3 * sigma
    last_two = daily_costs[-2:]

    if all(v > threshold for v in last_two) and daily_costs[-1] > 0:
        deviation_pct = ((daily_costs[-1] - baseline) / baseline * 100) if baseline > 0 else 0
        return {
            "provider": provider,
            "service_name": service_name,
            "baseline_cost": round(baseline, 4),
            "actual_cost": round(daily_costs[-1], 4),
            "deviation_pct": round(deviation_pct, 1),
        }
    return None
