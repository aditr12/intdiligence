"use client";

import { AlertTriangle, Cpu, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { calculate280G } from "@/lib/api";
import { cn, signedUsd, usd, usdCompact } from "@/lib/format";
import type { AuditResponse, Result280G } from "@/lib/types";
import { Badge, Card, Eyebrow, SectionHeading } from "./ui";

const DEBOUNCE_MS = 60;

function RangeField({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
  marker,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  marker?: number | null;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  const markerPct = marker != null ? ((marker - min) / (max - min)) * 100 : null;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-4">
        <label className="text-[13px] font-medium text-ink">{label}</label>
        <span className="font-mono text-[18px] font-semibold tabular-nums text-ink">{usd(value)}</span>
      </div>
      <div className="mb-3 text-[11.5px] text-ink-faint">{hint}</div>
      <div className="relative">
        <input
          type="range"
          className="sandbox-range w-full"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ ["--range-pct" as string]: `${pct}%` }}
          aria-label={label}
        />
        {markerPct != null && markerPct >= 0 && markerPct <= 100 && (
          <div
            className="pointer-events-none absolute -top-1 h-4 w-px bg-sky-300/80"
            style={{ left: `${markerPct}%` }}
            title="Filing value"
          />
        )}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[10.5px] text-ink-faint">
        <span>{usdCompact(min)}</span>
        {marker != null && <span className="text-sky-300/80">│ filing {usdCompact(marker)}</span>}
        <span>{usdCompact(max)}</span>
      </div>
    </div>
  );
}

function ScenarioMetric({
  label,
  value,
  baseline,
  emphasis,
}: {
  label: string;
  value: number | undefined;
  baseline: number | undefined;
  emphasis?: boolean;
}) {
  const delta = value != null && baseline != null ? value - baseline : null;
  return (
    <div className={cn("rounded-lg border border-line bg-white/[0.02] p-4", emphasis && "border-emerald-400/25 bg-emerald-400/[0.04]")}>
      <Eyebrow className="mb-2">{label}</Eyebrow>
      <div className="font-mono text-[19px] font-semibold tabular-nums text-ink">{usd(value)}</div>
      <div
        className={cn(
          "mt-1 font-mono text-[11.5px] tabular-nums",
          delta == null || delta === 0 ? "text-ink-faint" : delta > 0 ? "text-rose-300" : "text-emerald-300",
        )}
      >
        {delta == null ? "no filing baseline" : delta === 0 ? "= filing" : `${signedUsd(delta)} vs filing`}
      </div>
    </div>
  );
}

export function SandboxTab({ audit }: { audit: AuditResponse }) {
  const verified = audit.math_results.status === "VERIFIED" && !audit.math_results.irc_280g.error;
  const baseline = verified ? audit.math_results.irc_280g : null;
  const extractedBase = audit.liability?.base_compensation || null;
  const extractedParachute = audit.liability?.parachute_payment || null;

  const bounds = useMemo(
    () => ({
      baseMax: Math.max(5_000_000, Math.ceil((extractedBase ?? 0) / 10_000) * 10_000),
      parachuteMax: Math.max(200_000_000, Math.ceil((extractedParachute ?? 0) / 100_000) * 100_000),
    }),
    [extractedBase, extractedParachute],
  );
  const initialBase = Math.min(Math.max(extractedBase ?? 1_000_000, 100_000), bounds.baseMax);
  const initialParachute = Math.min(Math.max(extractedParachute ?? 5_000_000, 500_000), bounds.parachuteMax);

  const [base, setBase] = useState(initialBase);
  const [parachute, setParachute] = useState(initialParachute);
  const [scenario, setScenario] = useState<Result280G | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  // A new audit resets the sandbox to that filing's figures
  useEffect(() => {
    setBase(initialBase);
    setParachute(initialParachute);
  }, [audit.run.completed_at, initialBase, initialParachute]);

  useEffect(() => {
    setPending(true);
    const timer = setTimeout(async () => {
      controller.current?.abort();
      const current = new AbortController();
      controller.current = current;
      try {
        const result = await calculate280G(base, parachute, current.signal);
        setScenario(result);
        setError(null);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError((e as Error).message);
      } finally {
        if (controller.current === current) setPending(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [base, parachute]);

  const chartData = [
    { name: "Excess parachute", Filing: baseline?.excess_parachute, Scenario: scenario?.excess_parachute },
    { name: "§4999 excise tax", Filing: baseline?.excise_tax_20pct, Scenario: scenario?.excise_tax_20pct },
    { name: "Corporate cash loss", Filing: baseline?.corporate_tax_cash_cost_21pct, Scenario: scenario?.corporate_tax_cash_cost_21pct },
  ];

  return (
    <div className="space-y-5">
      {!verified && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-400/30 bg-rose-500/[0.06] p-4 text-[13px] text-rose-100/85">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rose-300" />
          <span>
            The filing figures for this audit are <span className="font-semibold text-rose-200">UNVERIFIED</span>. The sandbox starts from
            {extractedBase || extractedParachute ? " the rejected extraction" : " default values"} and has no verified baseline; use it for
            exploration only.
          </span>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Card className="p-5 sm:p-6">
          <SectionHeading
            title="Deal Scenario Inputs"
            aside={
              <button
                onClick={() => {
                  setBase(initialBase);
                  setParachute(initialParachute);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-[12px] text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
              >
                <RotateCcw className="size-3" /> Reset to filing
              </button>
            }
          />
          <div className="space-y-7">
            <RangeField
              label="Base Salary Proxy"
              hint="Stand-in for the §280G base amount (5-year average W-2)"
              value={base}
              min={100_000}
              max={bounds.baseMax}
              step={10_000}
              onChange={setBase}
              marker={verified ? extractedBase : null}
            />
            <RangeField
              label="Total Parachute Payout"
              hint="Hypothetical change-in-control payout on termination"
              value={parachute}
              min={500_000}
              max={bounds.parachuteMax}
              step={100_000}
              onChange={setParachute}
              marker={verified ? extractedParachute : null}
            />
          </div>
          <div className="mt-6 flex items-center justify-between rounded-lg border border-line bg-white/[0.02] px-3 py-2.5 text-[12.5px]">
            <span className="text-ink-muted">3x safe harbor</span>
            <span className="flex items-center gap-2 font-mono tabular-nums text-ink">
              {usd(scenario?.base_3x_threshold)}
              {scenario && <Badge tone={scenario.is_excess ? "rose" : "emerald"}>{scenario.is_excess ? "EXCEEDED" : "WITHIN"}</Badge>}
            </span>
          </div>
          <div className="mt-3 flex items-center gap-2 text-[11.5px] text-ink-faint">
            <Cpu className={cn("size-3.5", pending ? "animate-pulse text-emerald-300" : "")} />
            Recalculated by math_engine.py via POST /api/calculate/280g
          </div>
          {error && <div className="mt-2 text-[12px] text-rose-300">{error}</div>}
        </Card>

        <Card className="p-5 sm:p-6">
          <SectionHeading title="Live Statutory Exposure" aside={pending ? <Badge tone="sky">UPDATING</Badge> : <Badge tone="neutral">LIVE</Badge>} />
          <div className="grid gap-3 sm:grid-cols-3">
            <ScenarioMetric label="Excess parachute" value={scenario?.excess_parachute} baseline={baseline?.excess_parachute} />
            <ScenarioMetric label="§4999 excise tax" value={scenario?.excise_tax_20pct} baseline={baseline?.excise_tax_20pct} emphasis />
            <ScenarioMetric
              label="Corporate cash loss"
              value={scenario?.corporate_tax_cash_cost_21pct}
              baseline={baseline?.corporate_tax_cash_cost_21pct}
            />
          </div>
          <div className="mt-5 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }} barGap={4}>
                <CartesianGrid vertical={false} stroke="rgb(255 255 255 / 0.06)" />
                <XAxis dataKey="name" tick={{ fill: "#8b95a5", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis
                  tickFormatter={(v: number) => usdCompact(v)}
                  tick={{ fill: "#5b6575", fontSize: 11, fontFamily: "var(--font-geist-mono)" }}
                  axisLine={false}
                  tickLine={false}
                  width={64}
                />
                <Tooltip
                  cursor={{ fill: "rgb(255 255 255 / 0.03)" }}
                  contentStyle={{
                    background: "#10151d",
                    border: "1px solid rgb(255 255 255 / 0.14)",
                    borderRadius: 8,
                    fontSize: 12,
                    fontFamily: "var(--font-geist-mono)",
                  }}
                  labelStyle={{ color: "#e6ebf2" }}
                  formatter={(v) => usd(Number(v))}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: "#8b95a5" }} iconType="circle" iconSize={8} />
                {verified && <Bar dataKey="Filing" fill="#38bdf8" fillOpacity={0.55} radius={[4, 4, 0, 0]} maxBarSize={44} />}
                <Bar dataKey="Scenario" fill="#34d399" radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-3 text-[11.5px] leading-relaxed text-ink-faint">
            {scenario?.base_compensation_note ?? "Upper-bound face-value estimates"}. Sandbox scenarios are not saved to the memo or audit trail.
          </p>
        </Card>
      </div>
    </div>
  );
}
