"use client";

import { motion } from "framer-motion";
import { CalendarClock, Landmark, Receipt, ShieldAlert, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";
import { cn, splitStatus, usd, usdCompact } from "@/lib/format";
import type { AuditResponse } from "@/lib/types";
import { Badge, Eyebrow } from "./ui";

function KpiCard({
  eyebrow,
  icon,
  children,
  subtext,
  className,
  index,
}: {
  eyebrow: string;
  icon: ReactNode;
  children: ReactNode;
  subtext: ReactNode;
  className?: string;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.05, ease: "easeOut" }}
      className={cn(
        "relative flex min-h-[148px] flex-col overflow-hidden rounded-xl border border-line bg-surface/80 p-5 backdrop-blur-sm",
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <Eyebrow>{eyebrow}</Eyebrow>
        <span className="text-ink-faint">{icon}</span>
      </div>
      <div className="flex-1">{children}</div>
      <div className="mt-3 text-[12px] text-ink-muted">{subtext}</div>
    </motion.div>
  );
}

function Sparkline({ data }: { data: AuditResponse["sensitivity"] }) {
  if (data.length < 2) return null;
  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-9 h-14 opacity-90">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34d399" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Tooltip
            cursor={{ stroke: "rgb(255 255 255 / 0.15)" }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className="rounded-md border border-line-strong bg-surface-2 px-2 py-1 font-mono text-[11px] text-ink">
                  {Math.round(payload[0].payload.multiplier * 100)}% payout → {usdCompact(payload[0].payload.excise_tax_20pct)}
                </div>
              ) : null
            }
          />
          <Area
            type="monotone"
            dataKey="excise_tax_20pct"
            stroke="#34d399"
            strokeWidth={1.75}
            fill="url(#spark-fill)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function KpiGrid({ audit }: { audit: AuditResponse }) {
  const g280 = audit.math_results.irc_280g;
  const r10b = audit.math_results.rule_10b5_1;
  const verified = audit.math_results.status === "VERIFIED" && !g280.error;
  const { code: complianceCode } = splitStatus(r10b.verification_status);
  const complianceTone = r10b.error
    ? "neutral"
    : complianceCode === "CONFIRMED_VIOLATION"
      ? "rose"
      : complianceCode === "PRELIMINARY_PASS"
        ? "amber"
        : "emerald";
  const unverifiedFigure = (
    <div className="font-mono text-[22px] font-semibold tracking-tight text-ink-faint">Withheld</div>
  );

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        index={0}
        eyebrow="§4999 Excise Tax Drag"
        icon={<Receipt className="size-4" />}
        subtext={
          verified ? (
            <span className="relative z-10">
              Calculated via IRC §280G <span className="text-ink-faint">· trend: 50–150% payout</span>
            </span>
          ) : (
            "Not calculated: figures failed grounding"
          )
        }
      >
        {verified ? (
          <>
            <div className="relative z-10 font-mono text-[24px] font-semibold tracking-tight text-ink tabular-nums">
              {usd(g280.excise_tax_20pct)}
            </div>
            <Sparkline data={audit.sensitivity} />
          </>
        ) : (
          unverifiedFigure
        )}
      </KpiCard>

      <KpiCard
        index={1}
        eyebrow="Corporate Cash Loss 21%"
        icon={<Landmark className="size-4" />}
        subtext={verified ? "Disallowed deduction under §280G(a)" : "Not calculated: figures failed grounding"}
      >
        {verified ? (
          <>
            <div className="font-mono text-[24px] font-semibold tracking-tight text-ink tabular-nums">
              {usd(g280.corporate_tax_cash_cost_21pct)}
            </div>
            <div className="mt-1 font-mono text-[11.5px] text-ink-faint tabular-nums">
              on {usd(g280.disallowed_corporate_deduction)} lost deduction
            </div>
          </>
        ) : (
          unverifiedFigure
        )}
      </KpiCard>

      <KpiCard
        index={2}
        eyebrow="Rule 10b5-1 Compliance"
        icon={<CalendarClock className="size-4" />}
        subtext={
          r10b.error
            ? r10b.error
            : `${r10b.delta_days} calendar days · ${r10b.required_days} required`
        }
      >
        <Badge tone={complianceTone} className="px-2.5 py-1 text-[12px]">
          {r10b.error ? "NOT_VERIFIED" : complianceCode}
        </Badge>
        {!r10b.error && (
          <div className="mt-3 font-mono text-[24px] font-semibold tracking-tight text-ink tabular-nums">
            {r10b.delta_days}
            <span className="ml-1 text-[13px] font-normal text-ink-faint">days</span>
          </div>
        )}
      </KpiCard>

      <KpiCard
        index={3}
        eyebrow="Audit Integrity Status"
        icon={verified ? <ShieldCheck className="size-4 text-emerald-300" /> : <ShieldAlert className="size-4 text-rose-300" />}
        className={
          verified
            ? "border-emerald-400/30 bg-emerald-400/[0.04] shadow-[0_0_40px_-12px_rgb(16_185_129/0.55)]"
            : "border-rose-400/30 bg-rose-500/[0.05] shadow-[0_0_40px_-12px_rgb(244_63_94/0.45)]"
        }
        subtext={
          verified
            ? `Verified against DEF 14A proxy · ${audit.critic.iteration_count} extraction pass${audit.critic.iteration_count === 1 ? "" : "es"}`
            : `${audit.critic.feedback.length} unresolved critic finding${audit.critic.feedback.length === 1 ? "" : "s"} · manual audit required`
        }
      >
        <Badge tone={verified ? "emerald" : "rose"} className="px-2.5 py-1 text-[12px]">
          {verified ? "✓ GROUNDED" : "⚠ UNVERIFIED"}
        </Badge>
        <div className="mt-3 text-[12px] leading-relaxed text-ink-muted">
          {audit.extraction_sources.parachute_payment?.startsWith("Deterministic")
            ? "Parachute read deterministically from proxy table"
            : "Parachute extracted by LLM"}
        </div>
      </KpiCard>
    </div>
  );
}
