import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import requests
import streamlit as st

# graph.py imports its siblings as top-level modules (schemas, math_engine, agents), so src/ goes on the path
SRC_DIR = Path(__file__).resolve().parent / "src"
sys.path.insert(0, str(SRC_DIR))

from graph import graph, llm  # noqa: E402
from math_engine import calculate_280g_tax_drag, verify_10b51_cooling_off  # noqa: E402,F401

CACHE_DIR = Path(__file__).resolve().parent / ".cache"

st.set_page_config(
    page_title="IntDiligence | Autonomous M&A Auditor",
    page_icon="⚖️",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.markdown(
    """
    <style>
    :root {
        --idl-border: rgba(128, 128, 128, 0.28);
        --idl-card-bg: rgba(128, 128, 128, 0.06);
        --idl-pass-bg: #e6f4ea; --idl-pass-fg: #1e6b34;
        --idl-warn-bg: #fff4e0; --idl-warn-fg: #8a5300;
        --idl-fail-bg: #fde8e8; --idl-fail-fg: #a61b1b;
        --idl-neutral-bg: #eceff3; --idl-neutral-fg: #3c4450;
    }
    @media (prefers-color-scheme: dark) {
        :root {
            --idl-pass-bg: #163d24; --idl-pass-fg: #8fdca6;
            --idl-warn-bg: #3f2e0d; --idl-warn-fg: #f5c36b;
            --idl-fail-bg: #45191a; --idl-fail-fg: #f4a3a3;
            --idl-neutral-bg: #2a2f37; --idl-neutral-fg: #c5ccd6;
        }
    }
    div[data-testid="stMetric"] {
        border: 1px solid var(--idl-border);
        border-radius: 10px;
        padding: 14px 18px;
        background: var(--idl-card-bg);
    }
    .idl-card {
        border: 1px solid var(--idl-border);
        border-radius: 10px;
        padding: 14px 18px;
        background: var(--idl-card-bg);
        height: 100%;
    }
    .idl-card-label { font-size: 0.875rem; opacity: 0.75; margin-bottom: 8px; }
    .idl-badge {
        display: inline-block;
        padding: 4px 12px;
        border-radius: 999px;
        font-weight: 600;
        font-size: 0.95rem;
        letter-spacing: 0.02em;
    }
    .idl-pass { background: var(--idl-pass-bg); color: var(--idl-pass-fg); }
    .idl-warn { background: var(--idl-warn-bg); color: var(--idl-warn-fg); }
    .idl-fail { background: var(--idl-fail-bg); color: var(--idl-fail-fg); }
    .idl-neutral { background: var(--idl-neutral-bg); color: var(--idl-neutral-fg); }
    .idl-card-note { font-size: 0.8rem; opacity: 0.7; margin-top: 8px; }
    </style>
    """,
    unsafe_allow_html=True,
)

if "audit_state" not in st.session_state:
    st.session_state["audit_state"] = None


# ---------- Helpers ----------

@st.cache_data(ttl=30, show_spinner=False)
def ollama_status(base_url: str, model: str) -> tuple:
    try:
        tags = requests.get(f"{base_url}/api/tags", timeout=1.5).json()
    except (requests.RequestException, ValueError):
        return False, "server not reachable"
    names = {m.get("name") for m in tags.get("models", [])}
    return (True, "ready") if model in names else (False, f"model {model} not pulled")


def usd(value) -> str:
    if not isinstance(value, (int, float)):
        return "—"
    return f"-${abs(value):,.2f}" if value < 0 else f"${value:,.2f}"


def badge(text: str, tone: str) -> str:
    return f'<span class="idl-badge idl-{tone}">{text}</span>'


def badge_card(label: str, text: str, tone: str, note: str = "") -> str:
    note_html = f'<div class="idl-card-note">{note}</div>' if note else ""
    return f'<div class="idl-card"><div class="idl-card-label">{label}</div>{badge(text, tone)}{note_html}</div>'


def compliance_badge(rule_10b5_1: dict) -> tuple:
    status = rule_10b5_1.get("verification_status")
    if not status:
        return "NOT VERIFIED", "neutral", rule_10b5_1.get("error", "")
    if status.startswith("CONFIRMED_VIOLATION"):
        return "VIOLATION", "fail", f"{rule_10b5_1['delta_days']} of {rule_10b5_1['required_days']} required days"
    if status.startswith("PRELIMINARY_PASS"):
        return "PRELIMINARY_PASS", "warn", "Needs 10-Q/10-K filing date to confirm"
    return "CONFIRMED_PASS", "pass", f"{rule_10b5_1['delta_days']} days vs {rule_10b5_1['required_days']} required"


def to_jsonable(state: dict) -> dict:
    out = dict(state)
    if out.get("liability") is not None:
        out["liability"] = out["liability"].model_dump()
    return out


def clamp(value, lo, hi):
    return max(lo, min(hi, value))


# ---------- Sidebar ----------

with st.sidebar:
    st.title("⚖️ IntDiligence")
    st.caption("Autonomous M&A executive-liability auditor")

    ticker = st.text_input("Target Ticker", value="NVDA", max_chars=10).strip().upper()
    run_clicked = st.button("Run Due Diligence Audit", type="primary", width="stretch", disabled=not ticker)

    st.divider()
    st.subheader("Local Engine")
    ollama_ok, ollama_detail = ollama_status(llm.base_url or "http://localhost:11434", llm.model)
    cache_files = sorted(p.name for p in CACHE_DIR.glob("*_payload.json")) if CACHE_DIR.exists() else []
    st.markdown(
        "\n".join([
            f"- {'🟢' if ollama_ok else '🔴'} **Ollama ({llm.model})** — {ollama_detail}",
            "- 🟢 **LangGraph State Machine** — fetch → extract → critic → math → memo",
            f"- {'🟢' if cache_files else '⚪'} **Local Cache (.cache/)** — "
            + (f"{len(cache_files)} cached: {', '.join(f.split('_')[0] for f in cache_files)}" if cache_files else "empty"),
        ])
    )

    st.divider()
    st.subheader("Scope & Disclaimers")
    st.caption(
        "**IRC §280G / §4999:** Figures are upper-bound face-value estimates using disclosed base salary as a proxy "
        "for the statutory 5-year average W-2 base amount, and full change-in-control values without Treas. Reg. "
        "§ 1.280G-1 Q/A-24(c) acceleration discounts."
    )
    st.caption(
        "**SEC Rule 10b5-1:** Cooling-off is measured in calendar days from plan adoption to first trade. Without "
        "the 10-Q/10-K filing date, officer/director passes are preliminary (90-day floor; rule is up to 120 days)."
    )
    st.caption("Not legal or tax advice. Verify all figures against the source filings.")


# ---------- Execution ----------

if run_clicked:
    try:
        with st.spinner(f"Analyzing SEC Filings for {ticker}..."):
            state = graph.invoke({"ticker": ticker})
        state["_run"] = {"ticker": ticker, "completed_at": datetime.now(timezone.utc).isoformat()}
        st.session_state["audit_state"] = state
    except ValueError as e:
        st.error(f"Could not retrieve filings for {ticker}: {e}")
    except Exception as e:
        st.error(f"Audit failed: {type(e).__name__}: {e}. Check that Ollama is running with {llm.model} pulled.")


# ---------- Main panel ----------

state = st.session_state["audit_state"]

if state is None:
    st.title("IntDiligence Deal Room")
    st.info("Enter a ticker in the sidebar and click **Run Due Diligence Audit** to begin.")
    st.stop()

meta = state["raw_payload"].get("_meta", {})
math_results = state.get("math_results", {})
g280 = math_results.get("irc_280g", {})
r10b = math_results.get("rule_10b5_1", {})
liability = state.get("liability")
run_info = state.get("_run", {})
verified_280g = math_results.get("status") == "VERIFIED" and "error" not in g280

st.title(f"{meta.get('company_name', run_info.get('ticker'))} ({run_info.get('ticker')})")
st.caption(
    f"Parachute subject: **{state['parachute_executive']['name']}** · "
    f"Reporting person: **{state['trade_executive']['name']}** · "
    f"Audit completed {run_info.get('completed_at', '')[:19].replace('T', ' ')} UTC"
)
if meta.get("is_mock"):
    st.warning("This audit ran on **synthetic mock data**, not live SEC filings "
               f"({meta.get('fallback_reason', 'mock fixture')}).")

# a) KPI bar
k1, k2, k3, k4 = st.columns(4)
k1.metric("§4999 Excise Tax Drag", usd(g280.get("excise_tax_20pct")) if verified_280g else "—",
          help="20% excise tax on the excess parachute payment, borne by the executive")
k2.metric("Corporate Cash Loss (21%)", usd(g280.get("corporate_tax_cash_cost_21pct")) if verified_280g else "—",
          help="Tax cost of the disallowed §280G deduction at the 21% corporate rate")
text, tone, note = compliance_badge(r10b)
k3.markdown(badge_card("10b5-1 Compliance Status", text, tone, note), unsafe_allow_html=True)
if math_results.get("status") == "UNVERIFIED":
    k4.markdown(badge_card("Audit Integrity", "UNVERIFIED", "fail", "Figures failed critic grounding"),
                unsafe_allow_html=True)
else:
    k4.markdown(badge_card("Audit Integrity", "GROUNDED", "pass",
                           f"Critic passed in {state.get('iteration_count', 0)} extraction attempt(s)"),
                unsafe_allow_html=True)

st.write("")

# b) Deal room tabs
tab_memo, tab_sandbox, tab_audit = st.tabs([
    "📄 Executive Due Diligence Memo",
    "🧮 Statutory Breakdown & Scenario Sandbox",
    "🔍 Audit Trail & JSON Inspector",
])

with tab_memo:
    st.download_button(
        "Download Markdown Memo (.md)",
        data=state.get("final_memo", ""),
        file_name=f"{run_info.get('ticker', 'audit')}_due_diligence_memo.md",
        mime="text/markdown",
    )
    st.markdown(state.get("final_memo", "_No memo generated._"))

with tab_sandbox:
    st.subheader("IRC §280G / §4999 Scenario Sandbox")
    if not verified_280g:
        st.error("⚠️ Extracted parachute figures are UNVERIFIED. Sandbox values start from the unverified "
                 "extraction and are for exploration only.")

    base_extracted = (liability.base_compensation if liability else None) or 1_000_000.0
    parachute_extracted = (liability.parachute_payment if liability else None) or 5_000_000.0

    # Keep the extracted figure reachable even when it exceeds the default slider range
    base_max = max(5_000_000, int(base_extracted))
    parachute_max = max(200_000_000, int(parachute_extracted))
    run_key = run_info.get("completed_at", "")

    s1, s2 = st.columns(2)
    sim_base = s1.slider(
        "Simulated Base Salary ($)", min_value=100_000, max_value=base_max,
        value=int(clamp(base_extracted, 100_000, base_max)), step=10_000, format="$%d",
        key=f"sim_base_{run_key}",
    )
    sim_parachute = s2.slider(
        "Simulated Parachute Value ($)", min_value=500_000, max_value=parachute_max,
        value=int(clamp(parachute_extracted, 500_000, parachute_max)), step=100_000, format="$%d",
        key=f"sim_parachute_{run_key}",
    )

    scenario = calculate_280g_tax_drag(float(sim_base), float(sim_parachute))
    extracted = g280 if verified_280g else calculate_280g_tax_drag(base_extracted, parachute_extracted)

    m1, m2, m3, m4 = st.columns(4)
    delta = lambda key: (scenario[key] - extracted[key]) if "error" not in extracted else None  # noqa: E731
    m1.metric("Safe Harbor Exceeded", "Yes" if scenario["is_excess"] else "No")
    m2.metric("Excess Parachute", usd(scenario["excess_parachute"]),
              delta=usd(delta("excess_parachute")) if delta("excess_parachute") else None, delta_color="inverse")
    m3.metric("§4999 Excise Tax", usd(scenario["excise_tax_20pct"]),
              delta=usd(delta("excise_tax_20pct")) if delta("excise_tax_20pct") else None, delta_color="inverse")
    m4.metric("Corporate Cash Loss (21%)", usd(scenario["corporate_tax_cash_cost_21pct"]),
              delta=usd(delta("corporate_tax_cash_cost_21pct")) if delta("corporate_tax_cash_cost_21pct") else None,
              delta_color="inverse")

    rows = [
        ("Base Compensation", "base_compensation"),
        ("Parachute Payment (hypothetical)", "parachute_payment"),
        ("Safe Harbor Threshold (3x base)", "base_3x_threshold"),
        ("Excess Parachute", "excess_parachute"),
        ("§4999 Excise Tax (20%)", "excise_tax_20pct"),
        ("Corporate Cash Loss (21%)", "corporate_tax_cash_cost_21pct"),
    ]
    extracted_label = "Extracted (Filing)" if verified_280g else "Extracted (UNVERIFIED)"
    df = pd.DataFrame({
        "Item": [label for label, _ in rows],
        extracted_label: [usd(extracted.get(key)) for _, key in rows],
        "Scenario": [usd(scenario.get(key)) for _, key in rows],
        "Difference": [
            usd(scenario[key] - extracted[key]) if "error" not in extracted else "—" for _, key in rows
        ],
    })
    st.dataframe(df, hide_index=True, width="stretch")
    st.caption(scenario["base_compensation_note"] + ". Sandbox results are not saved to the memo or audit package.")

with tab_audit:
    package = {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "disclaimer": "Upper-bound estimates; not legal or tax advice.",
        "state": to_jsonable(state),
    }
    st.download_button(
        "Download Full Audit Package (.json)",
        data=json.dumps(package, indent=2, default=str),
        file_name=f"{run_info.get('ticker', 'audit')}_audit_package.json",
        mime="application/json",
    )

    with st.expander("Extracted Liabilities (Pydantic AuditedLiability)", expanded=True):
        st.json(liability.model_dump() if liability else {"error": "No liability extracted"})
        st.caption("Figure sources")
        st.json(state.get("extraction_sources", {}))
        st.caption("Derived fields (computed from the filing, not reported values)")
        st.json(state.get("derived_fields", {}))

    with st.expander("Raw Math Engine Outputs"):
        st.json(math_results)

    with st.expander("Critic Verification & Reflection Logs"):
        st.json({
            "extraction_attempts": state.get("iteration_count"),
            "needs_revision_at_exit": state.get("needs_revision"),
            "compensation_verified": state.get("compensation_verified"),
            "unresolved_findings": [line[2:] for line in (state.get("critic_feedback") or "").splitlines() if line],
            "parachute_executive": state.get("parachute_executive"),
            "trade_executive": state.get("trade_executive"),
        })

    with st.expander("Source Filing Payload"):
        st.json(state["raw_payload"], expanded=False)
