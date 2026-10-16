"use client";

import { Loader2, Play, Search } from "lucide-react";
import { cn } from "@/lib/format";

const PRESETS = ["NVDA", "AAPL", "TSLA"];

export function AuditControls({
  ticker,
  onTickerChange,
  onRun,
  running,
  cachedTickers,
}: {
  ticker: string;
  onTickerChange: (ticker: string) => void;
  onRun: () => void;
  running: boolean;
  cachedTickers: string[];
}) {
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!running && ticker) onRun();
      }}
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="group relative flex-1">
          <span className="sr-only">Target ticker</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-faint transition-colors group-focus-within:text-emerald-300" />
          <input
            value={ticker}
            onChange={(e) => onTickerChange(e.target.value.toUpperCase().replace(/[^A-Z.\-]/g, "").slice(0, 10))}
            placeholder="Enter target ticker, e.g. NVDA"
            spellCheck={false}
            autoComplete="off"
            className="h-12 w-full rounded-xl border border-line-strong bg-surface pl-11 pr-4 font-mono text-[15px] tracking-[0.08em] text-ink placeholder:font-sans placeholder:tracking-normal placeholder:text-ink-faint focus:border-emerald-400/50 focus:outline-none focus:ring-4 focus:ring-emerald-400/10"
          />
        </label>
        <button
          type="submit"
          disabled={running || !ticker}
          className={cn(
            "inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-6 text-[14px] font-semibold text-emerald-950",
            "shadow-[0_0_24px_-4px_rgb(16_185_129/0.65)] transition-all hover:shadow-[0_0_32px_-2px_rgb(16_185_129/0.8)] hover:brightness-110",
            "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-400/30",
            "disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none",
          )}
        >
          {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4 fill-current" />}
          {running ? "Auditing…" : "Execute Audit"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-faint">
        <span className="mr-1">Quick select</span>
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            disabled={running}
            onClick={() => onTickerChange(preset)}
            className={cn(
              "rounded-lg border px-3 py-1 font-mono text-[12px] tracking-wider transition-colors disabled:opacity-50",
              ticker === preset
                ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
                : "border-line bg-white/[0.02] text-ink-muted hover:border-line-strong hover:text-ink",
            )}
          >
            {preset}
            {cachedTickers.includes(preset) && (
              <span className="ml-1.5 text-[9px] text-ink-faint" title="Filings cached locally">
                ●
              </span>
            )}
          </button>
        ))}
        <span className="ml-auto hidden sm:inline">● filings cached in .cache/</span>
      </div>
    </form>
  );
}
