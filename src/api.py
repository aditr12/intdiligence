"""HTTP API for the IntDiligence deal room. Run with:

    venv/bin/uvicorn api:app --app-dir src --port 8000
"""
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from graph import LLM_MODEL, LLM_PROVIDER, graph, llm
from math_engine import calculate_280g_tax_drag

CACHE_DIR = Path(__file__).resolve().parents[1] / ".cache"
PIPELINE_STAGES = ["fetch", "extract", "critic", "math", "memo"]
SENSITIVITY_MULTIPLIERS = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5]

app = FastAPI(title="IntDiligence API")
app.add_middleware(
    CORSMiddleware,
    # Extra origins (e.g. the deployed frontend URL) come from a comma-separated env var
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"]
    + [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class AuditRequest(BaseModel):
    ticker: str = Field(min_length=1, max_length=10)


class TaxDragRequest(BaseModel):
    base_compensation: float
    parachute_payment: float


def _llm_status() -> dict:
    status = {"provider": LLM_PROVIDER, "model": LLM_MODEL}
    if LLM_PROVIDER == "groq":
        # Not probed on every health poll, to stay clear of Groq rate limits
        return {**status, "ok": True, "detail": "Groq API key configured"}
    base_url = llm.base_url or "http://localhost:11434"
    try:
        tags = requests.get(f"{base_url}/api/tags", timeout=1.5).json()
    except (requests.RequestException, ValueError):
        return {**status, "ok": False, "detail": "server not reachable"}
    pulled = {m.get("name") for m in tags.get("models", [])}
    if LLM_MODEL not in pulled:
        return {**status, "ok": False, "detail": f"model {LLM_MODEL} not pulled"}
    return {**status, "ok": True, "detail": "ready"}


def _sensitivity(liability) -> list:
    """Excise tax and corporate cash cost across a range of parachute values, from the math engine."""
    if liability is None or not liability.base_compensation or not liability.parachute_payment:
        return []
    points = []
    for multiplier in SENSITIVITY_MULTIPLIERS:
        result = calculate_280g_tax_drag(liability.base_compensation, liability.parachute_payment * multiplier)
        if "error" not in result:
            points.append({
                "multiplier": multiplier,
                "parachute_payment": result["parachute_payment"],
                "excise_tax_20pct": result["excise_tax_20pct"],
                "corporate_tax_cash_cost_21pct": result["corporate_tax_cash_cost_21pct"],
            })
    return points


@app.get("/api/health")
def health() -> dict:
    cached = sorted(p.name.split("_")[0] for p in CACHE_DIR.glob("*_payload.json")) if CACHE_DIR.exists() else []
    return {
        "llm": _llm_status(),
        "langgraph": {"ok": True, "stages": PIPELINE_STAGES},
        "cache": {"ok": True, "tickers": cached},
    }


@app.post("/api/audit")
def audit(request: AuditRequest) -> dict:
    ticker = request.ticker.strip().upper()
    started = time.perf_counter()
    try:
        state = graph.invoke({"ticker": ticker})
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except (ConnectionError, requests.ConnectionError) as e:
        raise HTTPException(status_code=503, detail=f"LLM unavailable ({LLM_PROVIDER}): {e}")
    except Exception as e:
        # Provider SDK errors (rate limits, auth, outages) surface as a clear 503 instead of a bare 500
        if type(e).__module__.split(".")[0] in ("groq", "httpx", "ollama"):
            raise HTTPException(status_code=503, detail=f"LLM provider error ({LLM_PROVIDER}): {e}")
        raise

    liability = state.get("liability")
    payload = state.get("raw_payload", {})
    return {
        "run": {
            "ticker": ticker,
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "duration_seconds": round(time.perf_counter() - started, 2),
            "model": LLM_MODEL,
            "provider": LLM_PROVIDER,
            "stages": PIPELINE_STAGES,
        },
        "meta": payload.get("_meta", {}),
        "parachute_executive": state.get("parachute_executive"),
        "trade_executive": state.get("trade_executive"),
        "liability": liability.model_dump() if liability else None,
        "extraction_sources": state.get("extraction_sources", {}),
        "derived_fields": state.get("derived_fields", {}),
        "critic": {
            "iteration_count": state.get("iteration_count"),
            "needs_revision": state.get("needs_revision"),
            "compensation_verified": state.get("compensation_verified"),
            "feedback": [line[2:] for line in (state.get("critic_feedback") or "").splitlines() if line.strip()],
        },
        "math_results": state.get("math_results", {}),
        "memo_sections": state.get("memo_sections", {}),
        "final_memo": state.get("final_memo", ""),
        "sensitivity": _sensitivity(liability) if state.get("math_results", {}).get("status") == "VERIFIED" else [],
        "trade_filing": state.get("trade_filing", {}),
        "def14a": {k: v for k, v in payload.get("def14a", {}).items() if k != "excerpts"},
    }


@app.post("/api/calculate/280g")
def calculate_280g(request: TaxDragRequest) -> dict:
    return calculate_280g_tax_drag(request.base_compensation, request.parachute_payment)
