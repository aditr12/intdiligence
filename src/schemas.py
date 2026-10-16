from typing import Any, Dict, Optional, TypedDict

from dateutil.parser import parse
from pydantic import BaseModel, Field, ValidationInfo, field_validator


class AuditedLiability(BaseModel):
    liability_type: str
    executive_name: str
    amount_usd: float = 0.0
    base_compensation: Optional[float] = None
    parachute_payment: Optional[float] = None
    adoption_date: Optional[str] = None
    transaction_date: Optional[str] = None
    exact_footnote_quote: str = Field(default="", description="Verbatim quote from filing footnote")

    @field_validator('amount_usd', 'base_compensation', 'parachute_payment', mode='before')
    @classmethod
    def clean_currency(cls, value: Any, info: ValidationInfo) -> Optional[float]:
        # amount_usd is required-with-default; the optional fields keep None as "not disclosed"
        fallback = 0.0 if info.field_name == 'amount_usd' else None
        if value is None or isinstance(value, bool):
            return fallback
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            cleaned = value.replace('$', '').replace(',', '').strip()
            negative = cleaned.startswith('(') and cleaned.endswith(')')
            if negative:
                cleaned = cleaned[1:-1].strip()
            try:
                number = float(cleaned)
            except ValueError:
                return fallback
            return -number if negative else number
        return fallback

    @field_validator('adoption_date', 'transaction_date', mode='before')
    @classmethod
    def normalize_date(cls, value: Any) -> Optional[str]:
        if not value or not isinstance(value, str):
            return None
        try:
            dt = parse(value)
            return dt.strftime('%Y-%m-%d')
        except Exception:
            return None


class State(TypedDict, total=False):
    ticker: str
    raw_payload: dict
    trade_filing: dict
    parachute_executive: Dict[str, Any]
    trade_executive: Dict[str, Any]
    # Values computed from filings (e.g. summed trade amounts), each with a label and method
    derived_fields: Dict[str, dict]
    liability: Optional[AuditedLiability]
    # Where each compensation figure came from (deterministic table parse vs LLM)
    extraction_sources: Dict[str, str]
    iteration_count: int
    needs_revision: bool
    compensation_verified: bool
    critic_feedback: str
    math_results: Dict[str, Any]
    final_memo: str
    # LLM narrative bullets, kept separately from the rendered memo for structured display
    memo_sections: Dict[str, Any]
