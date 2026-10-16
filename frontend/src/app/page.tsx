"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertOctagon, FileSearch, FlaskConical, Layers, ScanSearch } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AuditControls } from "@/components/AuditControls";
import { AuditTrailTab } from "@/components/AuditTrailTab";
import { Header } from "@/components/Header";
import { KpiGrid } from "@/components/KpiGrid";
import { MemoTab } from "@/components/MemoTab";
import { SandboxTab } from "@/components/SandboxTab";
import { Card, Eyebrow } from "@/components/ui";
import { getHealth, runAudit } from "@/lib/api";
import { cn, formatDate } from "@/lib/format";
import type { AuditResponse } from "@/lib/types";

const TABS = [
  { id: "memo", label: "Executive Memo & Key Findings", icon: FileSearch },
  { id: "sandbox", label: "Sensitivity Sandbox", icon: FlaskConical },
  { id: "trail", label: "Complete Audit Trail & Raw Data", icon: Layers },
] as const;
type TabId = (typeof TABS)[number]["id"];

const STAGES = [
  { id: "fetch", label: "Fetch", detail: "SEC EDGAR · DEF 14A + Form 4" },
  { id: "extract", label: "Extract", detail: "Structured LLM extraction" },
  { id: "critic", label: "Critic", detail: "Grounding & verbatim checks" },
  { id: "math", label: "Math", detail: "§280G / Rule 10b5-1 engine" },
  { id: "memo", label: "Memo", detail: "Template + narrative" },
];

function RunningPanel({ ticker, startedAt }: { ticker: string; startedAt: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setElapsed((Date.now() - startedAt) / 1000), 100);
    return () => clearInterval(timer);
  }, [startedAt]);

  return (
    <Card className="relative overflow-hidden p-6">
      <motion.div
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400 to-transparent"
        animate={{ x: ["-100%", "100%"] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <Eyebrow className="mb-1">Audit in progress</Eyebrow>
          <div className="text-[16px] font-semibold text-ink">
            Analyzing SEC filings for <span className="font-mono text-emerald-300">{ticker}</span>
          </div>
        </div>
        <div className="font-mono text-[13px] tabular-nums text-ink-muted">{elapsed.toFixed(1)}s · typically 15–30s</div>
      </div>
      <ol className="grid gap-2 sm:grid-cols-5">
        {STAGES.map((stage, i) => (
          <li key={stage.id} className="relative rounded-lg border border-line bg-white/[0.02] p-3">
            <motion.div
              className="absolute inset-0 rounded-lg bg-emerald-400/[0.06]"
              animate={{ opacity: [0, 1, 0] }}
              transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.5, ease: "easeInOut" }}
            />
            <div className="relative">
              <div className="font-mono text-[10.5px] text-ink-faint">0{i + 1}</div>
              <div className="text-[13px] font-medium text-ink">{stage.label}</div>
              <div className="text-[11.5px] text-ink-faint">{stage.detail}</div>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-[11.5px] text-ink-faint">The critic may loop extraction once if figures fail grounding.</p>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card className="flex flex-col items-center px-6 py-16 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] text-emerald-300 shadow-[0_0_30px_-8px_rgb(16_185_129/0.6)]">
        <ScanSearch className="size-5" />
      </div>
      <h2 className="text-[17px] font-semibold text-ink">No audit loaded</h2>
      <p className="mt-1.5 max-w-md text-[13.5px] leading-relaxed text-ink-muted">
        Choose a ticker and run an audit. IntDiligence pulls the latest proxy and Form 4 filings, extracts and grounds executive
        figures, and computes §280G and Rule 10b5-1 exposure deterministically.
      </p>
    </Card>
  );
}

export default function DealRoom() {
  const [ticker, setTicker] = useState("NVDA");
  const [results, setResults] = useState<Record<string, AuditResponse>>({});
  const [activeTicker, setActiveTicker] = useState<string | null>(null);
  const [running, setRunning] = useState<{ ticker: string; startedAt: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("memo");
  const [cachedTickers, setCachedTickers] = useState<string[]>([]);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => {
    getHealth()
      .then((h) => setCachedTickers(h.cache.tickers))
      .catch(() => {});
  }, [results]);

  const execute = useCallback(async () => {
    const target = ticker.trim().toUpperCase();
    if (!target) return;
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setError(null);
    setRunning({ ticker: target, startedAt: Date.now() });
    try {
      const audit = await runAudit(target, controller.signal);
      setResults((prev) => ({ ...prev, [target]: audit }));
      setActiveTicker(target);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      if (inFlight.current === controller) setRunning(null);
    }
  }, [ticker]);

  // Quick-select shows an already-run audit instantly; otherwise it just sets the ticker
  const selectTicker = (next: string) => {
    setTicker(next);
    if (results[next]) setActiveTicker(next);
  };

  const audit = activeTicker ? results[activeTicker] : null;

  return (
    <div className="deal-room-backdrop min-h-dvh">
      <Header />

      <main className="mx-auto max-w-[1400px] space-y-6 px-4 pb-16 pt-8 sm:px-6">
        <section className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Eyebrow className="mb-2 text-emerald-300/70">Executive Liability Deal Room</Eyebrow>
              <h1 className="text-[28px] font-semibold tracking-[-0.025em] text-ink sm:text-[32px]">
                Change-in-control & insider-trading audit
              </h1>
              <p className="mt-1.5 max-w-2xl text-[14px] text-ink-muted">
                IRC §280G golden-parachute exposure and SEC Rule 10b5-1 cooling-off compliance, grounded in the target&apos;s SEC filings.
              </p>
            </div>
            {Object.keys(results).length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {Object.keys(results).map((t) => (
                  <button
                    key={t}
                    onClick={() => selectTicker(t)}
                    className={cn(
                      "rounded-md px-2.5 py-1 font-mono text-[11.5px] transition-colors",
                      t === activeTicker ? "bg-white/10 text-ink" : "text-ink-faint hover:text-ink-muted",
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>
          <AuditControls
            ticker={ticker}
            onTickerChange={selectTicker}
            onRun={execute}
            running={running !== null}
            cachedTickers={cachedTickers}
          />
        </section>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-start gap-3 rounded-xl border border-rose-400/30 bg-rose-500/[0.07] p-4 text-[13.5px] text-rose-100"
              role="alert"
            >
              <AlertOctagon className="mt-0.5 size-4 shrink-0 text-rose-300" />
              <div>
                <div className="font-semibold text-rose-200">Audit failed</div>
                <div className="text-rose-100/80">{error}</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {running && <RunningPanel ticker={running.ticker} startedAt={running.startedAt} />}

        {audit ? (
          <motion.div
            key={audit.run.completed_at}
            initial={{ opacity: 0 }}
            animate={{ opacity: running ? 0.45 : 1 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[12.5px] text-ink-muted">
              <span className="text-[15px] font-semibold text-ink">
                {audit.meta.company_name ?? audit.run.ticker}
                <span className="ml-2 font-mono text-[12px] font-normal text-ink-faint">CIK {audit.meta.cik ?? "—"}</span>
              </span>
              <span>
                Parachute subject <span className="text-ink">{audit.parachute_executive.name ?? "—"}</span>
              </span>
              <span>
                Reporting person <span className="text-ink">{audit.trade_executive.name ?? "—"}</span>
              </span>
              <span className="font-mono text-[11.5px] text-ink-faint">
                {audit.meta.is_mock ? "MOCK FIXTURE" : "LIVE EDGAR"} · {formatDate(audit.run.completed_at)} · {audit.run.duration_seconds}s
              </span>
            </div>

            <KpiGrid audit={audit} />

            <div>
              <div role="tablist" className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
                {TABS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={tab === id}
                    onClick={() => setTab(id)}
                    className={cn(
                      "relative flex shrink-0 items-center gap-2 px-4 py-3 text-[13.5px] font-medium transition-colors",
                      tab === id ? "text-ink" : "text-ink-faint hover:text-ink-muted",
                    )}
                  >
                    <Icon className="size-4" />
                    {label}
                    {tab === id && (
                      <motion.span
                        layoutId="tab-underline"
                        className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-emerald-400 to-sky-400 shadow-[0_0_12px_rgb(16_185_129/0.7)]"
                      />
                    )}
                  </button>
                ))}
              </div>
              <AnimatePresence mode="wait">
                <motion.div
                  key={tab}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18 }}
                  role="tabpanel"
                >
                  {tab === "memo" && <MemoTab audit={audit} />}
                  {tab === "sandbox" && <SandboxTab audit={audit} />}
                  {tab === "trail" && <AuditTrailTab audit={audit} />}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        ) : (
          !running && <EmptyState />
        )}

        <footer className="pt-4 text-center text-[11.5px] leading-relaxed text-ink-faint">
          Upper-bound estimates from public SEC filings. §280G figures use disclosed salary as a base-amount proxy and full face value of
          change-in-control payouts. Not legal or tax advice.
        </footer>
      </main>
    </div>
  );
}
