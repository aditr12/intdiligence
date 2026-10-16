"use client";

import {
  AlertTriangle,
  ArrowDownToLine,
  BadgeCheck,
  Briefcase,
  CircleDot,
  FileText,
  Gavel,
  ListChecks,
  Quote,
  Scale,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";
import { addDays, cn, downloadFile, formatDate, splitStatus, usd, usdCompact } from "@/lib/format";
import type { AuditResponse } from "@/lib/types";
import { Badge, Card, DataRow, Eyebrow, SectionHeading } from "./ui";

const STATUTORY_NOTE =
  "§280G figures represent a conservative upper-bound face-value estimate. Final tax liabilities require applying " +
  "Treas. Reg. § 1.280G-1 Q/A-24(c) acceleration discount rules and 5-year historical W-2 average Base Amounts.";

function BulletList({ items, tone = "emerald" }: { items: string[]; tone?: "emerald" | "sky" | "amber" | "rose" }) {
  const dot = { emerald: "bg-emerald-400", sky: "bg-sky-400", amber: "bg-amber-400", rose: "bg-rose-400" }[tone];
  return (
    <ul className="space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-[13.5px] leading-relaxed text-ink/90">
          <span className={cn("mt-[0.55em] size-1.5 shrink-0 rounded-full", dot)} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function NarrativeTag({ model }: { model: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md bg-white/[0.03] px-2 py-0.5 text-[11px] text-ink-faint ring-1 ring-inset ring-line"
      title="Narrative is drafted by the local LLM and contains no figures by design; all numbers come from the deterministic math engine."
    >
      <Sparkles className="size-3" /> AI narrative · {model} · no figures
    </span>
  );
}

/** Bar scaled to the larger of payout and threshold, with a tick at the 3x safe-harbor threshold. */
function SafeHarborMeter({ payment, threshold }: { payment: number; threshold: number }) {
  const ratio = payment / threshold;
  const scale = Math.max(payment, threshold);
  const thresholdPct = (threshold / scale) * 100;
  const exceeded = ratio >= 1;
  return (
    <div className="mt-4 rounded-lg border border-line bg-white/[0.02] p-3">
      <div className="mb-2 flex items-center justify-between text-[11.5px]">
        <span className="text-ink-muted">Payout vs 3x safe harbor</span>
        <span className={cn("font-mono tabular-nums", exceeded ? "text-rose-300" : "text-emerald-300")}>
          {ratio.toFixed(1)}x threshold
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-white/[0.06]">
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full",
            exceeded ? "bg-gradient-to-r from-amber-400 to-rose-500" : "bg-emerald-400",
          )}
          style={{ width: `${(payment / scale) * 100}%` }}
        />
        <div className="absolute -inset-y-1 w-0.5 rounded bg-white" style={{ left: `calc(${thresholdPct}% - 1px)` }} />
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[10.5px] text-ink-faint">
        <span>│ 3x threshold {usdCompact(threshold)}</span>
        <span>payout {usdCompact(payment)}</span>
      </div>
    </div>
  );
}

function ParachuteSection({ audit }: { audit: AuditResponse }) {
  const g = audit.math_results.irc_280g;
  const exec = audit.parachute_executive;
  const title = exec.same_person_as_trader ? audit.trade_executive.title : "Named executive officer (DEF 14A)";
  const unverified = audit.math_results.status === "UNVERIFIED";

  return (
    <Card className="p-5 sm:p-6">
      <SectionHeading
        icon={<Scale className="size-4" />}
        title="Parachute Analysis · Target Executive"
        aside={<Badge tone={unverified ? "rose" : "emerald"}>{unverified ? "UNVERIFIED" : "IRC §280G / §4999"}</Badge>}
      />
      <div className="mb-4 flex items-start gap-3 rounded-lg border border-line bg-white/[0.02] p-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-300">
          <Briefcase className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="font-medium text-ink">{exec.name ?? "Unknown executive"}</div>
          <div className="text-[12.5px] text-ink-muted">{title}</div>
          <div className="mt-1 text-[11.5px] text-ink-faint">Pairing: {exec.pairing_basis}</div>
        </div>
      </div>

      {unverified ? (
        <div className="rounded-lg border border-rose-400/30 bg-rose-500/[0.06] p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-rose-300" />
            <div>
              <div className="text-[13.5px] font-semibold text-rose-200">PARACHUTE LIABILITY UNVERIFIED</div>
              <p className="mt-1 text-[13px] leading-relaxed text-rose-100/80">
                Extracted proxy values failed grounding validation after maximum retry attempts. Manual audit required.
                No §280G figures are reported.
              </p>
              {audit.critic.feedback.length > 0 && (
                <ul className="mt-3 space-y-1.5 border-t border-rose-400/20 pt-3">
                  {audit.critic.feedback.map((f, i) => (
                    <li key={i} className="font-mono text-[11.5px] leading-relaxed text-rose-200/80">
                      ✕ {f}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : g.error ? (
        <div className="text-[13px] text-ink-muted">Analysis could not be completed: {g.error}</div>
      ) : (
        <>
          <div>
            <DataRow label="Base salary proxy" hint="Stands in for the 5-year average W-2 base amount" value={usd(g.base_compensation)} />
            <DataRow
              label="Hypothetical change-in-control payout"
              hint="Would be received under hypothetical termination"
              value={usd(g.parachute_payment)}
            />
            <DataRow label="3x safe-harbor threshold" hint="IRC §280G(b)(2)(A)(ii)" value={usd(g.base_3x_threshold)} />
            <DataRow
              label="Safe harbor exceeded"
              value={<Badge tone={g.is_excess ? "rose" : "emerald"}>{g.is_excess ? "YES" : "NO"}</Badge>}
            />
            <DataRow label="Excess parachute payment" hint="Payout minus 1x base amount" value={usd(g.excess_parachute)} />
            <DataRow label="Executive excise tax (20%)" hint="IRC §4999" value={usd(g.excise_tax_20pct)} emphasis />
            <DataRow label="Disallowed corporate deduction" hint="IRC §280G(a)" value={usd(g.disallowed_corporate_deduction)} />
            <DataRow label="Corporate cash tax cost (21%)" value={usd(g.corporate_tax_cash_cost_21pct)} emphasis />
          </div>
          {g.parachute_payment && g.base_3x_threshold ? (
            <SafeHarborMeter payment={g.parachute_payment} threshold={g.base_3x_threshold} />
          ) : null}
        </>
      )}

      <div className="mt-4 flex gap-2.5 rounded-lg border border-amber-400/20 bg-amber-400/[0.05] p-3 text-[12px] leading-relaxed text-amber-100/80">
        <Gavel className="mt-0.5 size-3.5 shrink-0 text-amber-300" />
        <span>
          <span className="font-semibold text-amber-200">Note:</span> {STATUTORY_NOTE}
        </span>
      </div>
      <div className="mt-3 space-y-1 text-[11.5px] text-ink-faint">
        <div>Payout source: {audit.extraction_sources.parachute_payment ?? "—"}</div>
        <div>Base salary source: {audit.extraction_sources.base_compensation ?? "—"}</div>
        <div>Proxy: {exec.source}</div>
      </div>
    </Card>
  );
}

function TimelineStep({
  date,
  title,
  detail,
  tone,
  last,
}: {
  date: string;
  title: string;
  detail: ReactNode;
  tone: "emerald" | "sky" | "amber" | "rose" | "neutral";
  last?: boolean;
}) {
  const ring = {
    emerald: "border-emerald-400 bg-emerald-400/20",
    sky: "border-sky-400 bg-sky-400/20",
    amber: "border-amber-400 bg-amber-400/20",
    rose: "border-rose-400 bg-rose-400/20",
    neutral: "border-ink-faint bg-white/5",
  }[tone];
  return (
    <li className="relative flex gap-4 pb-5 last:pb-0">
      {!last && <span className="absolute left-[7px] top-5 h-[calc(100%-12px)] w-px bg-line-strong" />}
      <span className={cn("relative mt-1 size-[15px] shrink-0 rounded-full border-2", ring)} />
      <div className="min-w-0">
        <div className="font-mono text-[11.5px] text-ink-faint">{date}</div>
        <div className="text-[13.5px] font-medium text-ink">{title}</div>
        <div className="text-[12.5px] text-ink-muted">{detail}</div>
      </div>
    </li>
  );
}

function InsiderSection({ audit }: { audit: AuditResponse }) {
  const r = audit.math_results.rule_10b5_1;
  const trader = audit.trade_executive;
  const amount = audit.derived_fields.amount_usd;
  const { code, note } = splitStatus(r.verification_status);
  const tone = code === "CONFIRMED_VIOLATION" ? "rose" : code === "PRELIMINARY_PASS" ? "amber" : "emerald";
  const windowEnd = r.adoption_date && r.required_days ? addDays(r.adoption_date, r.required_days) : null;
  const transactions = audit.trade_filing.transactions ?? [];

  return (
    <Card className="p-5 sm:p-6">
      <SectionHeading
        icon={<FileText className="size-4" />}
        title="Insider Trading Analysis · Reporting Person"
        aside={<Badge tone={r.error ? "neutral" : tone}>{r.error ? "NOT_VERIFIED" : code}</Badge>}
      />
      <div className="mb-5 flex items-start gap-3 rounded-lg border border-line bg-white/[0.02] p-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-400/10 text-sky-300">
          <FileText className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="font-medium text-ink">{trader.name ?? "Unknown"}</div>
          <div className="text-[12.5px] text-ink-muted">{trader.title ?? "—"}</div>
          <div className="mt-1 font-mono text-[11.5px] text-ink-faint">Form 4 · {trader.form4_accession_number ?? "—"}</div>
        </div>
      </div>

      {r.error ? (
        <div className="text-[13px] text-ink-muted">Cooling-off could not be verified: {r.error}</div>
      ) : (
        <>
          <Eyebrow className="mb-3">Cooling-off timeline</Eyebrow>
          <ol className="mb-5">
            <TimelineStep
              date={formatDate(r.adoption_date)}
              title="Rule 10b5-1 plan adopted"
              detail="Stated in Form 4 footnote"
              tone="sky"
            />
            <TimelineStep
              date={formatDate(windowEnd)}
              title={`Cooling-off window ends (+${r.required_days} days)`}
              detail={
                r.earnings_filing_date
                  ? `Later of 90 days or 2 business days after ${formatDate(r.earnings_filing_date)} filing`
                  : "90-day officer/director floor · 10-Q/10-K date not provided"
              }
              tone="neutral"
            />
            <TimelineStep
              date={formatDate(r.transaction_date)}
              title={`First trade executed (day ${r.delta_days})`}
              detail={r.is_compliant ? `${(r.delta_days ?? 0) - (r.required_days ?? 0)} days after the window closed` : "Inside the cooling-off window"}
              tone={r.is_compliant ? "emerald" : "rose"}
              last
            />
          </ol>

          <Eyebrow className="mb-2">Findings</Eyebrow>
          <ul className="mb-4 space-y-2 text-[13px] text-ink/90">
            <li className="flex gap-2.5">
              <CircleDot className="mt-0.5 size-3.5 shrink-0 text-sky-300" />
              <span>
                <span className="font-mono tabular-nums">{r.delta_days}</span> calendar days from adoption to first trade against
                a <span className="font-mono tabular-nums">{r.required_days}</span>-day requirement
                {r.is_officer ? " (officer/director rule)" : " (non-officer rule)"}.
              </span>
            </li>
            <li className="flex gap-2.5">
              <CircleDot className={cn("mt-0.5 size-3.5 shrink-0", r.is_compliant ? "text-emerald-300" : "text-rose-300")} />
              <span>{r.is_compliant ? "Cooling-off requirement satisfied." : r.violation_reason}</span>
            </li>
            {note && (
              <li className="flex gap-2.5">
                <CircleDot className="mt-0.5 size-3.5 shrink-0 text-amber-300" />
                <span>{note}.</span>
              </li>
            )}
          </ul>
        </>
      )}

      <div className="rounded-lg border border-line">
        <DataRow
          label={`Trade amount · ${amount?.label ?? "Derived"}`}
          hint={amount?.method}
          value={usd(typeof amount?.value === "number" ? amount.value : null)}
          emphasis
        />
      </div>
      {transactions.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left font-mono text-[11.5px] tabular-nums">
            <thead className="text-ink-faint">
              <tr className="border-b border-line">
                <th className="py-2 pr-3 font-normal">Date</th>
                <th className="py-2 pr-3 font-normal">Code</th>
                <th className="py-2 pr-3 text-right font-normal">Shares</th>
                <th className="py-2 pr-3 text-right font-normal">Price</th>
                <th className="py-2 text-right font-normal">Amount</th>
              </tr>
            </thead>
            <tbody className="text-ink-muted">
              {transactions.map((t, i) => (
                <tr key={i} className="border-b border-line last:border-b-0">
                  <td className="py-1.5 pr-3">{t.transaction_date}</td>
                  <td className="py-1.5 pr-3">{t.transaction_code}</td>
                  <td className="py-1.5 pr-3 text-right">{t.shares?.toLocaleString("en-US") ?? "—"}</td>
                  <td className="py-1.5 pr-3 text-right">{usd(t.price_per_share)}</td>
                  <td className="py-1.5 text-right">{usd(t.transaction_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function SourceQuote({ audit }: { audit: AuditResponse }) {
  const quote = audit.liability?.exact_footnote_quote;
  if (!quote) return null;
  const footnotes = audit.trade_filing.footnotes ?? {};
  const footnoteId = Object.entries(footnotes).find(([, text]) => text.replace(/\s+/g, " ").includes(quote.replace(/\s+/g, " ")))?.[0];
  const quoteVerified = !audit.critic.feedback.some((f) => f.includes("exact_footnote_quote"));

  return (
    <div className="relative overflow-hidden rounded-xl border border-emerald-400/25 bg-gradient-to-br from-emerald-400/[0.07] via-surface to-sky-400/[0.05] p-5 sm:p-6">
      <Quote className="absolute -right-2 -top-2 size-24 text-emerald-300/[0.07]" />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Eyebrow>Source quote · SEC Form 4</Eyebrow>
        {quoteVerified ? (
          <Badge tone="emerald">
            <BadgeCheck className="size-3" /> VERBATIM MATCH
          </Badge>
        ) : (
          <Badge tone="rose">NOT FOUND IN FILING</Badge>
        )}
      </div>
      <blockquote className="relative border-l-2 border-emerald-400/60 pl-4 font-serif text-[16px] leading-relaxed text-ink">
        “{quote}”
      </blockquote>
      <div className="mt-3 font-mono text-[11.5px] text-ink-faint">
        {audit.trade_executive.form4_accession_number ?? "—"}
        {footnoteId ? ` · footnote ${footnoteId}` : ""}
        {audit.trade_filing.filing_date ? ` · filed ${formatDate(audit.trade_filing.filing_date)}` : ""}
      </div>
    </div>
  );
}

export function MemoTab({ audit }: { audit: AuditResponse }) {
  const sections = audit.memo_sections;
  const ticker = audit.run.ticker;
  const company = audit.meta.company_name ?? ticker;

  return (
    <div className="space-y-5">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Eyebrow className="mb-2">Executive due diligence memorandum</Eyebrow>
            <h2 className="text-[22px] font-semibold tracking-tight text-ink">
              {company} <span className="font-mono text-[16px] text-ink-faint">({ticker})</span>
            </h2>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
              <dt className="text-ink-faint">To</dt>
              <dd className="text-ink-muted">Deal Team</dd>
              <dt className="text-ink-faint">From</dt>
              <dd className="text-ink-muted">Diligence · IntDiligence automated audit</dd>
              <dt className="text-ink-faint">Re</dt>
              <dd className="text-ink-muted">Executive Compensation &amp; Insider Trading Review</dd>
              <dt className="text-ink-faint">Date</dt>
              <dd className="font-mono text-ink-muted">{formatDate(audit.run.completed_at)}</dd>
            </dl>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => downloadFile(`${ticker}_due_diligence_memo.md`, audit.final_memo, "text/markdown")}
              className="inline-flex items-center gap-2 rounded-lg border border-line-strong bg-white/[0.03] px-3 py-2 text-[12.5px] text-ink-muted transition-colors hover:border-emerald-400/40 hover:text-ink"
            >
              <ArrowDownToLine className="size-3.5" /> Memo (.md)
            </button>
          </div>
        </div>
        {audit.meta.is_mock && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/[0.06] px-3 py-2 text-[12.5px] text-amber-200">
            <AlertTriangle className="size-4 shrink-0" />
            Synthetic mock data, not live SEC filings{audit.meta.fallback_reason ? ` (${audit.meta.fallback_reason})` : ""}.
          </div>
        )}

        <div className="mt-6 border-t border-line pt-5">
          <SectionHeading icon={<ListChecks className="size-4" />} title="Executive Summary" aside={<NarrativeTag model={audit.run.model} />} />
          {sections.executive_summary?.length ? (
            <BulletList items={sections.executive_summary} />
          ) : (
            <p className="text-[13px] text-ink-faint">No summary generated.</p>
          )}
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <ParachuteSection audit={audit} />
        <InsiderSection audit={audit} />
      </div>

      <SourceQuote audit={audit} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <SectionHeading icon={<Scale className="size-4" />} title="Strategic Risk Mitigation" aside={<NarrativeTag model={audit.run.model} />} />
          <BulletList items={sections.risk_mitigation ?? []} tone="sky" />
        </Card>
        <Card className="p-5 sm:p-6">
          <SectionHeading icon={<ListChecks className="size-4" />} title="Due Diligence Open Items" aside={<NarrativeTag model={audit.run.model} />} />
          <BulletList items={sections.open_items ?? []} tone="amber" />
          {audit.critic.feedback.length > 0 && (
            <div className="mt-4 border-t border-line pt-4">
              <Eyebrow className="mb-2 text-rose-300/80">Unresolved critic findings</Eyebrow>
              <BulletList items={audit.critic.feedback} tone="rose" />
            </div>
          )}
          {(sections.stray_figures?.length ?? 0) > 0 && (
            <p className="mt-4 text-[12px] text-rose-200/80">
              Narrative contained figures not produced by the math engine ({sections.stray_figures!.join(", ")}); rely on the tables.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
