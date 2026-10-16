import json
import os
import re
from typing import List, Optional

from langchain_core.exceptions import OutputParserException
from langchain_ollama import ChatOllama
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field, ValidationError

from agents.auditor import extract_parachute_via_regex, fetch_sec_filings
from math_engine import calculate_280g_tax_drag, verify_10b51_cooling_off
from schemas import AuditedLiability, State

MAX_EXTRACTION_ATTEMPTS = 2

def _build_llm():
    """Groq-hosted gpt-oss-120b when GROQ_API_KEY is set (e.g. CPU-only Cloud Run), else local Ollama."""
    if os.environ.get("GROQ_API_KEY"):
        from langchain_groq import ChatGroq

        return ChatGroq(
            model=os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b"),
            temperature=0.0,
            max_retries=2,
        )
    return ChatOllama(
        model=os.environ.get("OLLAMA_MODEL", "llama3.1:8b"),
        base_url=os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434"),
        temperature=0.0,
        # Ollama's default context window truncates the proxy excerpts; 16k fits the full prompt
        num_ctx=16384,
    )


llm = _build_llm()
LLM_PROVIDER = "groq" if os.environ.get("GROQ_API_KEY") else "ollama"
LLM_MODEL = getattr(llm, "model_name", None) or getattr(llm, "model", None)


# ---------- Payload helpers (deterministic, no LLM) ----------

def _last_name(name: Optional[str]) -> str:
    return (name or "").replace(",", " ").split()[-1].lower() if (name or "").strip() else ""


def _proxy_executive_name(payload: dict) -> Optional[str]:
    def14a = payload.get("def14a", {})
    if def14a.get("peo_name"):
        return def14a["peo_name"]
    executives = def14a.get("executives") or []
    return executives[0]["name"] if executives else None


def _is_proxy_neo(name: str, payload: dict) -> bool:
    """True if the person has disclosed compensation in the proxy (a named executive officer)."""
    last = _last_name(name)
    if not last:
        return False
    def14a = payload.get("def14a", {})
    if any(_last_name(e.get("name")) == last for e in def14a.get("executives") or []):
        return True
    text = " ".join((def14a.get("excerpts") or {}).values())
    return re.search(rf"\b{re.escape(last)}\b", text, flags=re.IGNORECASE) is not None


def _pair_executives(payload: dict) -> tuple:
    """Selects the Form 4 to audit and the executive whose parachute is analyzed, pairing them
    on the same person whenever the filings allow. Returns (form4, parachute_executive, trade_executive)."""
    filings = payload.get("form4") or []
    plan_filings = [f for f in filings if f.get("rule_10b5_1", {}).get("is_10b5_1_plan")] or filings
    peo_name = _proxy_executive_name(payload)

    form4, parachute_name, basis = None, peo_name, "principal executive officer; no paired Form 4 trade"
    peo_filings = [f for f in plan_filings if peo_name and _last_name(f["reporting_owner"]["name"]) == _last_name(peo_name)]
    neo_filings = [f for f in plan_filings if _is_proxy_neo(f["reporting_owner"]["name"], payload)]
    if peo_filings:
        form4, basis = peo_filings[0], "principal executive officer's own 10b5-1 trade"
    elif neo_filings:
        form4 = neo_filings[0]
        parachute_name = form4["reporting_owner"]["name"]
        basis = "most recent 10b5-1 trade by a named executive officer with proxy-disclosed parachute"
    elif plan_filings:
        form4 = plan_filings[0]
        basis = "trader has no proxy-disclosed parachute; parachute analyzed for principal executive officer"

    owner = (form4 or {}).get("reporting_owner", {})
    trade_executive = {
        "name": owner.get("name"),
        "title": owner.get("officer_title") or owner.get("relationship"),
        "form4_accession_number": (form4 or {}).get("accession_number"),
    }
    parachute_executive = {
        "name": parachute_name,
        "source": f"DEF 14A {payload.get('def14a', {}).get('accession_number')}",
        "pairing_basis": basis,
        "same_person_as_trader": _last_name(parachute_name) == _last_name(owner.get("name")),
    }
    return form4, parachute_executive, trade_executive


def _is_section16_insider(form4: dict) -> bool:
    # Rule 10b5-1's 90/120-day cooling-off applies to both officers and directors
    owner = form4.get("reporting_owner", {})
    if "is_officer" in owner or "is_director" in owner:
        return bool(owner.get("is_officer") or owner.get("is_director"))
    return owner.get("relationship") in ("Officer", "Director")


def _normalize_ws(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def _quote_is_verbatim(quote: str, form4: dict) -> bool:
    quote = _normalize_ws(quote)
    if not quote:
        return False
    return any(quote in _normalize_ws(footnote) for footnote in (form4.get("footnotes") or {}).values())


NUMBER_PATTERN = re.compile(r"\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?")


def _literal_numbers(text: str) -> set:
    """All numbers written in the text, e.g. '93,862,775' or '1500000', as floats."""
    return {float(m.replace(",", "")) for m in NUMBER_PATTERN.findall(text or "")}


def _is_grounded(value: Optional[float], filing_numbers: set) -> bool:
    return value is not None and any(abs(value - n) < 0.5 for n in filing_numbers)


def _derive_trade_fields(form4: dict) -> dict:
    """Values computed from the Form 4 rather than read from a single filing field, labeled as such."""
    transactions = form4.get("transactions") or []
    amounts = [t["transaction_amount"] for t in transactions if t.get("transaction_amount") is not None]
    dates = sorted(t["transaction_date"] for t in transactions if t.get("transaction_date"))
    n = len(amounts)
    return {
        "amount_usd": {
            "value": sum(amounts) if amounts else None,
            "label": f"Derived Aggregate ({n} Transaction{'s' if n != 1 else ''})",
            "method": f"Sum of shares x reported price per share across {n} Form 4 transaction(s); "
                      "not a single figure reported in the filing",
            "components": amounts,
        },
        "transaction_date": {
            "value": AuditedLiability.normalize_date(dates[0]) if dates else None,
            "label": f"Earliest Transaction Date (of {len(dates)})",
            "method": "Earliest transaction date in the Form 4, used as the first trade under the plan",
        },
    }


# ---------- Agent 1: Fetch ----------

def fetch_node(state: State) -> dict:
    payload = fetch_sec_filings(state["ticker"])
    form4, parachute_executive, trade_executive = _pair_executives(payload)
    return {
        "raw_payload": payload,
        "trade_filing": form4 or {},
        "parachute_executive": parachute_executive,
        "trade_executive": trade_executive,
        "derived_fields": _derive_trade_fields(form4 or {}),
        "iteration_count": 0,
    }


# ---------- Agent 2: Extract ----------

EXTRACT_PROMPT = """You are a securities-law analyst extracting figures from SEC filings.
Extract exactly one AuditedLiability record. Copy values from the filings; do not calculate or estimate.

Field rules:
- liability_type: "Change-in-Control Parachute / Rule 10b5-1 Trade"
- executive_name: {executive_name}
- base_compensation: {executive_name}'s base SALARY for the most recent fiscal year, from the DEF 14A.
  Use the row for {executive_name} only, not any other executive.
- parachute_payment: {executive_name}'s TOTAL potential payment upon a change in control (with or without
  termination, whichever is larger) from the DEF 14A. If only equity acceleration is disclosed, use its total value.
- adoption_date: the date the Rule 10b5-1 trading plan was adopted, as stated in the Form 4 footnotes.
- transaction_date: the transaction date on the Form 4.
- amount_usd: the Form 4 transaction amount in USD.
- exact_footnote_quote: the COMPLETE Form 4 footnote sentence that states the 10b5-1 plan adoption date,
  copied character-for-character.
{feedback}
=== DEF 14A (proxy statement) ===
{def14a}

=== FORM 4 (insider trade by {insider_name}) ===
{form4}
"""


def extract_node(state: State) -> dict:
    payload = state["raw_payload"]
    form4 = state["trade_filing"]
    feedback = state.get("critic_feedback")

    prompt = EXTRACT_PROMPT.format(
        executive_name=state["parachute_executive"]["name"] or "the principal executive officer",
        feedback=f"\nA reviewer rejected your previous extraction. Fix these issues:\n{feedback}\n" if feedback else "",
        def14a=json.dumps(payload.get("def14a", {}), indent=1),
        insider_name=state["trade_executive"]["name"] or "unknown",
        form4=json.dumps(form4, indent=1),
    )

    try:
        liability = llm.with_structured_output(AuditedLiability).invoke(prompt)
    except (OutputParserException, ValidationError, ValueError) as e:
        liability = None
        feedback = f"Extraction output could not be parsed: {e}"

    # The parachute total is read straight from the proxy table row when possible; the LLM value is a fallback
    parachute_executive = state["parachute_executive"]["name"]
    def14a_text = "\n".join((payload.get("def14a", {}).get("excerpts") or {}).values())
    table_parachute = extract_parachute_via_regex(def14a_text, parachute_executive)
    if table_parachute is not None and not _is_grounded(table_parachute, _literal_numbers(def14a_text)):
        table_parachute = None
    extraction_sources = {
        "parachute_payment": "Deterministic parse of DEF 14A 'Potential Payments Upon Termination or "
                             "Change-in-Control' table row" if table_parachute is not None else "LLM extraction",
        "base_compensation": "LLM extraction",
    }

    # Identity, trade date and amount are fixed by the filings: take them from state, not the LLM.
    # amount_usd/transaction_date are derived values; derived_fields carries their labels.
    if liability is not None:
        derived = state["derived_fields"]
        liability = liability.model_copy(update={
            "executive_name": parachute_executive or liability.executive_name,
            "parachute_payment": table_parachute if table_parachute is not None else liability.parachute_payment,
            "amount_usd": derived["amount_usd"]["value"] if derived["amount_usd"]["value"] is not None else liability.amount_usd,
            "transaction_date": derived["transaction_date"]["value"] or liability.transaction_date,
        })

    update = {
        "liability": liability,
        "extraction_sources": extraction_sources,
        "iteration_count": state.get("iteration_count", 0) + 1,
    }
    if liability is None:
        update["critic_feedback"] = feedback
    return update


# ---------- Agent 3: Critic ----------

def critic_node(state: State) -> dict:
    liability = state.get("liability")
    issues = []
    compensation_issue = False

    if liability is None:
        compensation_issue = True
        issues.append(state.get("critic_feedback") or "No liability record was extracted.")
    else:
        if liability.base_compensation is None or liability.base_compensation <= 0:
            compensation_issue = True
            issues.append("base_compensation is missing or not positive; use the base salary from the Summary Compensation Table.")
        if liability.parachute_payment is None or liability.parachute_payment <= 0:
            compensation_issue = True
            issues.append("parachute_payment is missing or not positive; use the change-in-control total from Potential Payments Upon Termination or Change-in-Control.")
        if liability.adoption_date is None:
            issues.append("adoption_date is missing; find the 10b5-1 plan adoption date in the Form 4 footnotes.")
        if liability.transaction_date is None:
            issues.append("transaction_date is missing.")
        filing_numbers = _literal_numbers(json.dumps(state["raw_payload"].get("def14a", {})))
        for field in ("base_compensation", "parachute_payment"):
            value = getattr(liability, field)
            if value is not None and value > 0 and not _is_grounded(value, filing_numbers):
                compensation_issue = True
                issues.append(
                    f"{field} ({value:,.0f}): Extracted compensation figure does not match any literal number "
                    f"in DEF 14A filing text."
                )
        if not _quote_is_verbatim(liability.exact_footnote_quote, state["trade_filing"]):
            issues.append("exact_footnote_quote does not appear verbatim in the reviewed Form 4's footnotes; copy the footnote text exactly.")

    # needs_revision stays True while problems remain; route_after_critic enforces the retry cap
    return {
        "needs_revision": bool(issues),
        "compensation_verified": not compensation_issue,
        "critic_feedback": "\n".join(f"- {issue}" for issue in issues),
    }


def route_after_critic(state: State) -> str:
    if state.get("needs_revision") and state.get("iteration_count", 0) < MAX_EXTRACTION_ATTEMPTS:
        return "extract"
    return "math"


# ---------- Deterministic math ----------

def math_node(state: State) -> dict:
    liability = state.get("liability")

    rule_10b5_1 = verify_10b51_cooling_off(
        liability.adoption_date if liability else None,
        liability.transaction_date if liability else None,
        earnings_filing_date_str=None,
        is_officer=_is_section16_insider(state["trade_filing"]),
    )

    retries_exhausted = state.get("iteration_count", 0) >= MAX_EXTRACTION_ATTEMPTS
    if state.get("needs_revision") and retries_exhausted and not state.get("compensation_verified", False):
        # Never compute statutory liabilities from figures the critic could not ground in the filing
        reason = "Extracted compensation figures failed Critic grounding checks."
        return {"math_results": {
            "status": "UNVERIFIED",
            "reason": reason,
            "irc_280g": {"status": "UNVERIFIED", "reason": reason},
            "rule_10b5_1": rule_10b5_1,
        }}

    return {"math_results": {
        "status": "VERIFIED",
        "irc_280g": calculate_280g_tax_drag(liability.base_compensation, liability.parachute_payment),
        "rule_10b5_1": rule_10b5_1,
    }}


# ---------- Agent 4: Memo (deterministic math sections + LLM narrative) ----------

STATUTORY_280G_NOTE = (
    "Note: §280G figures represent a conservative upper-bound face-value estimate. Final tax liabilities "
    "require applying Treas. Reg. § 1.280G-1 Q/A-24(c) acceleration discount rules and 5-year historical "
    "W-2 average Base Amounts."
)

UNVERIFIED_ALERT = (
    "⚠️ PARACHUTE LIABILITY UNVERIFIED: Extracted proxy values failed grounding validation after maximum "
    "retry attempts. Manual audit required."
)

USD_PATTERN = re.compile(r"\$\s?\d[\d,]*(?:\.\d+)?")


def _usd(value) -> str:
    return f"${value:,.2f}" if isinstance(value, (int, float)) else "Not available"


def _render_280g_section(parachute_executive: dict, result: dict, sources: dict) -> str:
    lines = [
        f"## Parachute Analysis (Target Executive): {parachute_executive['name']}",
        "",
        f"> {STATUTORY_280G_NOTE}",
        "",
        f"*Pairing basis: {parachute_executive['pairing_basis']}. Source: {parachute_executive['source']}.*",
        "",
    ]
    if result.get("status") == "UNVERIFIED":
        return "\n".join(lines + [f"> **{UNVERIFIED_ALERT}**", ">", f"> Reason: {result['reason']}", ""])
    if "error" in result:
        return "\n".join(lines + [f"**IRC §280G / §4999 analysis could not be verified:** {result['error']}", ""])

    triggered = "Yes" if result["is_excess"] else "No"
    lines += [
        "### IRC §280G / §4999 Math Breakdown",
        "",
        "Change-in-control amounts below are amounts that **would be received under hypothetical termination** "
        "following a change in control; they have not been paid.",
        "",
        "| Item | Amount |",
        "|---|---|",
        f"| Base compensation (proxy for §280G base amount) | {_usd(result['base_compensation'])} |",
        f"| Hypothetical change-in-control payment | {_usd(result['parachute_payment'])} |",
        f"| 3x safe-harbor threshold (IRC §280G(b)(2)(A)(ii)) | {_usd(result['base_3x_threshold'])} |",
        f"| Safe harbor exceeded | {triggered} |",
        f"| Excess parachute payment (payment - 1x base amount) | {_usd(result['excess_parachute'])} |",
        f"| Executive excise tax, 20% (IRC §4999) | {_usd(result['excise_tax_20pct'])} |",
        f"| Disallowed corporate deduction (IRC §280G(a)) | {_usd(result['disallowed_corporate_deduction'])} |",
        f"| Corporate cash tax cost of lost deduction, 21% | {_usd(result['corporate_tax_cash_cost_21pct'])} |",
        "",
        f"*{result['base_compensation_note']}.*",
        "",
        f"*Figure sources: change-in-control payment - {sources.get('parachute_payment', 'LLM extraction')}; "
        f"base compensation - {sources.get('base_compensation', 'LLM extraction')}.*",
        "",
    ]
    return "\n".join(lines)


def _render_10b51_section(trade_executive: dict, liability: Optional[AuditedLiability],
                          derived: dict, result: dict) -> str:
    amount = derived["amount_usd"]
    trade_date = derived["transaction_date"]
    lines = [
        f"## Insider Trading Analysis (Reporting Person): {trade_executive['name']}",
        "",
        "| Item | Value |",
        "|---|---|",
        f"| Title | {trade_executive.get('title') or 'Not available'} |",
        f"| Form 4 accession number | {trade_executive.get('form4_accession_number') or 'Not available'} |",
        f"| Rule 10b5-1 plan adoption date | {(liability.adoption_date if liability else None) or 'Not available'} |",
        f"| Trade date ({trade_date['label']}) | {trade_date['value'] or 'Not available'} |",
        f"| Trade amount ({amount['label']}) | {_usd(amount['value'])} |",
        "",
        f"*Trade amount is derived, not reported as a single figure: {amount['method']}.*",
        "",
    ]
    if liability and liability.exact_footnote_quote:
        lines += ["Form 4 footnote (verbatim):", "", f"> {liability.exact_footnote_quote}", ""]

    lines += ["### Rule 10b5-1 Cooling-Off Compliance", ""]
    if "error" in result:
        return "\n".join(lines + [f"**Cooling-off compliance could not be verified:** {result['error']}", ""])

    lines += [
        "| Item | Value |",
        "|---|---|",
        f"| Officer/director (90-120 day rule applies) | {'Yes' if result['is_officer'] else 'No'} |",
        f"| Earnings filing date used | {result['earnings_filing_date'] or 'Not provided'} |",
        f"| Required cooling-off | {result['required_days']} days |",
        f"| Actual days from adoption to first trade | {result['delta_days']} days |",
        f"| Compliant | {'Yes' if result['is_compliant'] else 'No'} |",
        f"| Verification status | {result['verification_status']} |",
        "",
    ]
    if result.get("violation_reason"):
        lines += [f"**Violation:** {result['violation_reason']}", ""]
    return "\n".join(lines)


class QualitativeSections(BaseModel):
    # Lists of bullets rather than one text blob: small models reliably fill arrays but often stop a
    # free-text field after its lead-in sentence
    executive_summary: List[str] = Field(min_length=2, description="3-4 key findings, one sentence each")
    risk_mitigation: List[str] = Field(min_length=2, description="Strategic risk mitigation steps, one per item")
    open_items: List[str] = Field(min_length=1, description="Due diligence open items and data limitations")


QUALITATIVE_PROMPT = """You are a senior M&A due diligence attorney writing three narrative sections of an
Executive Due Diligence Memo for {company} ({ticker}). The figures tables are generated separately by code.

Rules:
- Do NOT write any dollar amounts, percentages of pay, or day counts. Describe findings qualitatively
  (e.g. "exceeds the 3x safe harbor", "cooling-off satisfied on a preliminary basis") and name the person
  each finding concerns.
- Cite IRC §280G and §4999 for golden-parachute matters and SEC Rule 10b5-1 for trading-plan matters.
  Do not cite IRC §162(m) or any other code section.
- Change-in-control amounts are hypothetical: say they "would be received under hypothetical termination",
  never that they were paid or received.
- {same_person_rule}

Write:
Each field is a list; each list item is one complete bullet (a full sentence, no leading bullet symbol).
1. executive_summary: 3-4 bullet points of key findings.
2. risk_mitigation: strategic risk mitigation, e.g. §280G cutback / best-net provisions, shareholder
   cleansing vote (private targets only), reasonable-compensation analysis under §280G, trading-plan review,
   escrow or indemnity, reps & warranties.
3. open_items: due diligence open items and data limitations.{open_items}

=== Findings ===
{findings}
"""


def _findings_for_llm(state: State) -> dict:
    """Non-numeric view of the results, so the narrative cannot restate or alter figures."""
    g280 = state.get("math_results", {}).get("irc_280g", {})
    r10b = state.get("math_results", {}).get("rule_10b5_1", {})
    return {
        "parachute_executive": state["parachute_executive"],
        "trade_executive": state["trade_executive"],
        "irc_280g": {"status": "UNVERIFIED - no figures; manual audit required", "reason": g280["reason"]}
        if g280.get("status") == "UNVERIFIED" else {"error": g280["error"]} if "error" in g280 else {
            "safe_harbor_exceeded": g280["is_excess"],
            "figures_are_upper_bound_estimates": True,
            "base_amount_is_salary_proxy_not_5yr_w2_average": True,
        },
        "rule_10b5_1": {"error": r10b["error"]} if "error" in r10b else {
            "is_compliant": r10b["is_compliant"],
            "verification_status": r10b["verification_status"],
            "earnings_filing_date_provided": r10b["earnings_filing_date"] is not None,
        },
        "data_source_is_mock": state["raw_payload"].get("_meta", {}).get("is_mock", False),
    }


def _normalize_bullets(text: str) -> str:
    """Turns '•' bullets into Markdown list items, each on its own line, with a blank line before the list."""
    lines = [line.strip() for line in text.replace("•", "\n- ").splitlines()]
    out = []
    for line in filter(None, lines):
        is_item = line.startswith(("- ", "* ")) or line == "-"
        if is_item:
            line = "- " + line[2:].strip()
            if out and not out[-1].startswith("- "):
                out.append("")
        elif out:
            out.append("")
        out.append(line)
    return "\n".join(out)


def memo_node(state: State) -> dict:
    meta = state["raw_payload"].get("_meta", {})
    parachute_executive = state["parachute_executive"]
    trade_executive = state["trade_executive"]
    math_results = state.get("math_results", {})
    unresolved = state.get("critic_feedback")

    section_280g = _render_280g_section(parachute_executive, math_results.get("irc_280g", {}),
                                        state.get("extraction_sources", {}))
    section_10b51 = _render_10b51_section(trade_executive, state.get("liability"), state["derived_fields"],
                                          math_results.get("rule_10b5_1", {}))

    prompt = QUALITATIVE_PROMPT.format(
        company=meta.get("company_name", state["ticker"]),
        ticker=state["ticker"],
        same_person_rule=(
            f"Both the parachute and the trade concern the same person, {trade_executive['name']}."
            if parachute_executive["same_person_as_trader"] else
            f"These are DIFFERENT people: the parachute belongs to {parachute_executive['name']} and the trade "
            f"was made by {trade_executive['name']}. Never attribute the trade to {parachute_executive['name']}."
        ),
        open_items=(f" Include these unresolved reviewer findings:\n{unresolved}" if unresolved else ""),
        findings=json.dumps(_findings_for_llm(state), indent=1),
    )
    try:
        narrative = llm.with_structured_output(QualitativeSections).invoke(prompt)
    except (OutputParserException, ValidationError, ValueError) as e:
        narrative = QualitativeSections(
            executive_summary=["Narrative generation failed; see the analysis tables below.", "Manual review required."],
            risk_mitigation=["Not generated.", "Manual review required."],
            open_items=[f"Narrative generation failed: {e}"],
        )

    sections = {
        field: _normalize_bullets("\n".join(f"- {item.strip().lstrip('•*- ').strip()}" for item in getattr(narrative, field)
                                            if item.strip()))
        for field in ("executive_summary", "risk_mitigation", "open_items")
    }

    # Any dollar figure in the narrative must match one printed by the deterministic sections
    allowed = _literal_numbers(" ".join(USD_PATTERN.findall(section_280g + section_10b51)))
    narrative_text = " ".join(sections.values())
    stray = [m for m in USD_PATTERN.findall(narrative_text) if not _is_grounded(float(m.strip("$ ").replace(",", "")), allowed)]

    header = [
        f"# Executive Due Diligence Memo: {meta.get('company_name', state['ticker'])} ({state['ticker']})",
        "",
        "**To:** Deal Team  ",
        "**From:** Diligence  ",
        "**Re:** Executive Compensation & Insider Trading Review",
        "",
    ]
    if meta.get("is_mock"):
        header += ["> **WARNING: This memo is based on SYNTHETIC MOCK DATA, not real SEC filings.**", ""]
    if math_results.get("status") == "UNVERIFIED":
        header += [f"> **{UNVERIFIED_ALERT}**", ""]

    open_items = [sections["open_items"]]
    if unresolved:
        open_items.append("Unresolved automated review findings:\n" + unresolved)
    if stray:
        open_items.append(f"- Narrative contained dollar figures not produced by the math engine ({', '.join(stray)}); "
                          "rely on the tables above.")

    memo = "\n".join(header + [
        "## Executive Summary", "", sections["executive_summary"], "",
        section_280g,
        section_10b51,
        "## Strategic Risk Mitigation", "", sections["risk_mitigation"], "",
        "## Due Diligence Open Items", "", "\n\n".join(open_items), "",
    ])
    return {
        "final_memo": memo,
        "memo_sections": {
            "executive_summary": list(narrative.executive_summary),
            "risk_mitigation": list(narrative.risk_mitigation),
            "open_items": list(narrative.open_items),
            "stray_figures": stray,
        },
    }


# ---------- Graph ----------

def build_graph():
    builder = StateGraph(State)
    builder.add_node("fetch", fetch_node)
    builder.add_node("extract", extract_node)
    builder.add_node("critic", critic_node)
    builder.add_node("math", math_node)
    builder.add_node("memo", memo_node)

    builder.add_edge(START, "fetch")
    builder.add_edge("fetch", "extract")
    builder.add_edge("extract", "critic")
    builder.add_conditional_edges("critic", route_after_critic, {"extract": "extract", "math": "math"})
    builder.add_edge("math", "memo")
    builder.add_edge("memo", END)
    return builder.compile()


graph = build_graph()


if __name__ == "__main__":
    state = graph.invoke({"ticker": "NVDA"})
    print(f"Parachute executive: {state['parachute_executive']}")
    print(f"Trade executive: {state['trade_executive']}")
    print(f"Derived amount: {state['derived_fields']['amount_usd']['label']} = {state['derived_fields']['amount_usd']['value']}")
    print(f"Extraction attempts: {state['iteration_count']}")
    print(f"Extraction sources: {state.get('extraction_sources')}")
    if state.get("critic_feedback"):
        print(f"Unresolved critic findings:\n{state['critic_feedback']}")
    print(json.dumps(state["math_results"], indent=2))
    print("\n" + "=" * 80 + "\n")
    print(state["final_memo"])
