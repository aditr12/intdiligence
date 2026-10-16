import json
import math
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import edgar

identity = os.environ.get("EDGAR_IDENTITY", "IntDiligence project@intdiligence.com")
edgar.set_identity(identity)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
CACHE_DIR = PROJECT_ROOT / ".cache"
MOCK_FIXTURE = PROJECT_ROOT / "data" / "fixtures" / "nvda_mock.json"

MAX_FORM4_FILINGS = 10
MAX_EXCERPT_CHARS = 8000

# Proxy headings that carry base salary and change-in-control (golden parachute) figures
PROXY_EXCERPT_HEADINGS = {
    "summary_compensation_table": r"Summary Compensation Table for (Fiscal|the Fiscal|Years?)",
    "potential_payments_upon_termination_or_cic": r"Potential Payments Upon Termination or Change[- ]in[- ]Control",
    "golden_parachute_compensation": r"Golden Parachute Compensation",
}


def _to_number(value):
    """Converts pandas/numpy scalars to plain floats; NaN becomes None."""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(number) else number


def _excerpt(text: str, heading_pattern: str) -> str:
    match = re.search(heading_pattern, text, flags=re.IGNORECASE)
    if not match:
        return ""
    return text[match.start():match.start() + MAX_EXCERPT_CHARS]


TABLE_NUMBER_PATTERN = re.compile(r"\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d{4,}(?:\.\d+)?")


def extract_parachute_via_regex(def14a_text: str, executive_name: str) -> Optional[float]:
    """Reads the executive's row in the 'Potential Payments Upon Termination or Change-in-Control'
    table and returns its final numeric column (the total). Returns None if no row matches."""
    if not def14a_text or not executive_name:
        return None
    heading = re.search(PROXY_EXCERPT_HEADINGS["potential_payments_upon_termination_or_cic"], def14a_text,
                        flags=re.IGNORECASE)
    if not heading:
        return None

    parts = executive_name.replace(",", " ").split()
    last_name = re.escape(parts[-1])
    first_name = re.escape(parts[0]) if len(parts) > 1 else None
    table_text = def14a_text[heading.end():heading.end() + MAX_EXCERPT_CHARS]

    for line in table_text.splitlines():
        if not re.search(rf"\b{last_name}\b", line, flags=re.IGNORECASE):
            continue
        if first_name and not re.search(rf"\b{first_name}\b", line, flags=re.IGNORECASE):
            continue
        # Only numbers after the name, so digits in the name cell are ignored
        name_end = re.search(rf"\b{last_name}\b", line, flags=re.IGNORECASE).end()
        numbers = TABLE_NUMBER_PATTERN.findall(line[name_end:])
        if numbers:
            return float(numbers[-1].replace(",", ""))
    return None


def _fetch_def14a(company) -> dict:
    filing = company.get_filings(form="DEF 14A").latest(1)
    proxy = filing.obj()

    section = proxy.section("executive_compensation")
    text = section.text() if section is not None else filing.text()

    return {
        "form_type": "DEF 14A",
        "accession_number": filing.accession_no,
        "filing_date": str(filing.filing_date),
        "peo_name": proxy.peo_name,
        "peo_total_comp": _to_number(proxy.peo_total_comp),
        "excerpts": {name: _excerpt(text, pattern) for name, pattern in PROXY_EXCERPT_HEADINGS.items()},
    }


def _fetch_form4(filing) -> dict:
    form4 = filing.obj()
    owner = form4.reporting_owners.owners[0]

    transactions = []
    table = form4.non_derivative_table
    if table is not None and table.has_transactions:
        for row in table.transactions.data.to_dict(orient="records"):
            shares = _to_number(row.get("Shares"))
            price = _to_number(row.get("Price"))
            transactions.append({
                "security_title": row.get("Security"),
                "transaction_date": str(row.get("Date")),
                "transaction_code": row.get("Code"),
                "acquired_disposed": row.get("AcquiredDisposed"),
                "shares": shares,
                "price_per_share": price,
                "transaction_amount": shares * price if shares is not None and price is not None else None,
                "currency": "USD",
                "footnote_ids": [f for f in str(row.get("footnotes") or "").split() if f],
            })

    return {
        "form_type": "4",
        "accession_number": filing.accession_no,
        "filing_date": str(filing.filing_date),
        "reporting_owner": {
            "name": owner.name,
            "relationship": "Officer" if getattr(owner, "is_officer", False) else (
                "Director" if getattr(owner, "is_director", False) else "Other"
            ),
            "officer_title": form4.position,
            "is_officer": bool(getattr(owner, "is_officer", False)),
            "is_director": bool(getattr(owner, "is_director", False)),
        },
        "rule_10b5_1": {
            "is_10b5_1_plan": bool(form4.aff10b5_one),
            # Adoption date lives in footnote prose; left for the extraction step
            "adoption_date": None,
        },
        "transactions": transactions,
        # edgartools' Footnotes wrapper exposes no public iteration, so read its backing dict
        "footnotes": dict(getattr(form4.footnotes, "_footnotes", None) or {}),
    }


def load_nvda_mock() -> dict:
    with open(MOCK_FIXTURE) as f:
        return json.load(f)


def fetch_sec_filings(ticker: str) -> dict:
    ticker_upper = ticker.strip().upper()
    CACHE_DIR.mkdir(exist_ok=True)
    cache_path = CACHE_DIR / f"{ticker_upper}_payload.json"

    if cache_path.exists():
        with open(cache_path) as f:
            return json.load(f)

    try:
        company = edgar.Company(ticker_upper)

        form4_payloads = []
        for filing in company.get_filings(form="4").latest(MAX_FORM4_FILINGS):
            try:
                form4_payloads.append(_fetch_form4(filing))
            except Exception as e:
                print(f"WARNING: Skipping Form 4 {filing.accession_no}: {e}")

        payload = {
            "_meta": {
                "description": f"Live SEC EDGAR filings for {ticker_upper}",
                "is_mock": False,
                "ticker": ticker_upper,
                "company_name": company.name,
                "cik": str(company.cik).zfill(10),
                "fetched_at": datetime.now(timezone.utc).isoformat(),
            },
            "def14a": _fetch_def14a(company),
            "form4": form4_payloads,
        }
        if not form4_payloads:
            raise ValueError("no Form 4 filings could be parsed")

        with open(cache_path, "w") as f:
            json.dump(payload, f, indent=2, default=str)
        return payload

    except Exception as e:
        if ticker_upper == "NVDA":
            print("Warning: Live SEC fetch failed for NVDA. Falling back to data/fixtures/nvda_mock.json")
            payload = load_nvda_mock()
            payload["_meta"]["fallback_reason"] = f"{type(e).__name__}: {e}"
            return payload
        raise ValueError(f"Failed to retrieve SEC filings for ticker '{ticker}' and no local cache exists.") from e


if __name__ == "__main__":
    result = fetch_sec_filings("NVDA")
    meta = result["_meta"]
    print(f"Source: {'MOCK' if meta.get('is_mock') else 'LIVE'} | {meta.get('company_name')} (CIK {meta.get('cik')})")
    print(f"DEF 14A: {result['def14a'].get('accession_number')} filed {result['def14a'].get('filing_date')}")
    for name, excerpt in result["def14a"].get("excerpts", {}).items():
        print(f"  {name}: {len(excerpt)} chars")
    print(f"Form 4 filings: {len(result['form4'])}")
    for f4 in result["form4"][:3]:
        owner = f4["reporting_owner"]
        print(f"  {f4['filing_date']} {owner['name']} ({owner['officer_title']}): "
              f"{len(f4['transactions'])} txns, 10b5-1={f4['rule_10b5_1']['is_10b5_1_plan']}, "
              f"footnotes={list(f4['footnotes'])}")
