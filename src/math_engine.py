from datetime import datetime, timedelta
from typing import Optional


def add_business_days(start_dt: datetime, business_days: int) -> datetime:
    """Adds business days to a date, skipping Saturday/Sunday (holidays not considered)."""
    current = start_dt
    added = 0
    while added < business_days:
        current += timedelta(days=1)
        if current.weekday() < 5:
            added += 1
    return current


def calculate_280g_tax_drag(base_compensation: float, parachute_payment: float) -> dict:
    """
    Calculates statutory IRC §280G tax drag and §4999 executive excise tax.
    Statutory Rule: Triggered if parachute >= 3x base comp.
    Once triggered, excess parachute = parachute_payment - 1x base_compensation.
    """
    if base_compensation is None or base_compensation <= 0 or parachute_payment is None or parachute_payment <= 0:
        return {"error": "Invalid or missing compensation/parachute figures"}

    base_3x_threshold = base_compensation * 3.0
    is_excess = parachute_payment >= base_3x_threshold

    # Statutory Tax Law: Excess parachute is total payment minus ONE times base comp
    excess_parachute = (parachute_payment - base_compensation) if is_excess else 0.0
    excise_tax_20pct = excess_parachute * 0.20
    corporate_tax_cash_cost = excess_parachute * 0.21

    return {
        "base_compensation_note": "Estimated using disclosed base compensation (statutory base amount uses 5-year average W-2)",
        "base_compensation": base_compensation,
        "parachute_payment": parachute_payment,
        "base_3x_threshold": base_3x_threshold,
        "is_excess": is_excess,
        "excess_parachute": excess_parachute,
        "excise_tax_20pct": excise_tax_20pct,
        "disallowed_corporate_deduction": excess_parachute,
        "corporate_tax_cash_cost_21pct": corporate_tax_cash_cost
    }


def verify_10b51_cooling_off(
    adoption_date_str: str,
    transaction_date_str: str,
    earnings_filing_date_str: Optional[str] = None,
    is_officer: bool = True,
) -> dict:
    """
    Calculates calendar day delta between 10b5-1 adoption and execution.
    Flags non-compliance under SEC Rule 10b5-1:
    - Officers/directors: later of 90 days or 2 days after the 10-Q/10-K filing
      for the quarter of adoption, capped at 120 days (90 if no filing date given,
      in which case a pass is only preliminary).
    - Other persons: 30 days.
    """
    if not adoption_date_str or not transaction_date_str:
        return {"error": "Missing adoption or transaction date"}

    try:
        adoption_dt = datetime.fromisoformat(adoption_date_str)
        transaction_dt = datetime.fromisoformat(transaction_date_str)

        if not is_officer:
            required_days = 30
            basis = "30-day minimum for persons other than officers/directors"
        elif earnings_filing_date_str:
            earnings_plus_2 = add_business_days(datetime.fromisoformat(earnings_filing_date_str), 2)
            required_days = min(120, max(90, (earnings_plus_2 - adoption_dt).days))
            basis = (
                f"officer/director rule: later of 90 days or 2 business days after earnings filing "
                f"({earnings_filing_date_str}), capped at 120 days"
            )
        else:
            required_days = 90
            basis = "officer/director 90-day default (no earnings filing date provided)"

        delta_days = (transaction_dt - adoption_dt).days
        is_compliant = delta_days >= required_days

        # 90 is the floor for officers, so without the earnings filing date only a violation is final
        if is_officer and not earnings_filing_date_str:
            verification_status = (
                "PRELIMINARY_PASS (Requires 10-Q/10-K filing date for final verification)"
                if is_compliant else "CONFIRMED_VIOLATION"
            )
        else:
            verification_status = "CONFIRMED_PASS" if is_compliant else "CONFIRMED_VIOLATION"

        return {
            "adoption_date": adoption_date_str,
            "transaction_date": transaction_date_str,
            "earnings_filing_date": earnings_filing_date_str,
            "is_officer": is_officer,
            "required_days": required_days,
            "delta_days": delta_days,
            "is_compliant": is_compliant,
            "verification_status": verification_status,
            "violation_reason": None if is_compliant else (
                f"Cooling-off period was {delta_days} days, short of the {required_days}-day "
                f"minimum required under SEC Rule 10b5-1 ({basis})."
            )
        }
    except Exception as e:
        return {"error": f"Date parsing failure: {str(e)}"}


if __name__ == "__main__":
    res_280g = calculate_280g_tax_drag(1500000.0, 8000000.0)
    print("280G Statutory Check:", res_280g)

    res_10b51 = verify_10b51_cooling_off("2025-10-01", "2025-11-15")
    print("10b5-1 Check (officer, default):", res_10b51)

    res_10b51 = verify_10b51_cooling_off("2025-10-01", "2026-01-15", earnings_filing_date_str="2026-02-25")
    print("10b5-1 Check (officer, earnings date):", res_10b51)

    res_10b51 = verify_10b51_cooling_off("2025-10-01", "2026-01-05")
    print("10b5-1 Check (officer, preliminary pass):", res_10b51)

    res_10b51 = verify_10b51_cooling_off("2025-10-01", "2025-11-15", is_officer=False)
    print("10b5-1 Check (non-officer):", res_10b51)
