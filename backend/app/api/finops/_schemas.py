"""Pydantic schemas for FinOps endpoints."""
from typing import List, Optional

from pydantic import BaseModel


class BudgetCreate(BaseModel):
    name: str
    provider: str = "all"          # aws | azure | all
    amount: float
    period: str = "monthly"        # monthly | quarterly | annual
    alert_threshold: float = 0.8   # 0.0–1.0


class BudgetUpdate(BaseModel):
    name: Optional[str] = None
    amount: Optional[float] = None
    alert_threshold: Optional[float] = None
    is_active: Optional[bool] = None


class DismissRequest(BaseModel):
    reason: Optional[str] = None


class ReportScheduleUpsert(BaseModel):
    name: str
    schedule_type: str              # weekly | monthly
    send_day: int                   # 0-6 (mon=0) for weekly; 1-28 for monthly
    send_time: str                  # HH:MM
    timezone: str = "America/Sao_Paulo"
    recipients: List[str] = []     # list of email addresses
    include_budgets: bool = True
    include_finops: bool = True
    include_costs: bool = True
    is_enabled: bool = True


class BulkDismissRequest(BaseModel):
    rec_ids: List[str]
    reason: Optional[str] = ""


class BulkApplyRequest(BaseModel):
    rec_ids: List[str]


class ScanScheduleRequest(BaseModel):
    schedule_type: str = "daily"   # "daily"|"weekdays"|"weekends"
    schedule_time: str             # "HH:MM"
    timezone: str = "America/Sao_Paulo"
    provider: str = "all"          # "all"|"aws"|"azure"
    is_enabled: bool = True
