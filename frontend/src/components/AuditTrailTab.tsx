"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowDownToLine, Braces, ChevronDown, Database, FileCode2, RefreshCcw, ScrollText } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn, downloadFile } from "@/lib/format";
import type { AuditResponse } from "@/lib/types";
import { JsonView } from "./JsonView";
import { Badge, Card, Eyebrow } from "./ui";

function Collapsible({
  title,
  icon,
  badge,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon: ReactNode;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-white/[0.02]"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2.5 text-[14px] font-semibold text-ink">
          <span className="text-ink-muted">{icon}</span>
          {title}
        </span>
        <span className="flex items-center gap-2">
          {badge}
          <ChevronDown className={cn("size-4 text-ink-faint transition-transform", open && "rotate-180")} />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <div className="border-t border-line px-5 pb-5 pt-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

function ReflectionLog({ audit }: { audit: AuditResponse }) {
  const { critic } = audit;
  const passed = critic.feedback.length === 0;
  const attempts = Array.from({ length: critic.iteration_count ?? 0 }, (_, i) => i + 1);
  return (
    <ol className="mb-4 space-y-2">
      {attempts.map((attempt) => {
        const isLast = attempt === attempts.length;
        const outcome = isLast ? (passed ? "accepted" : "rejected · retries exhausted") : "rejected · revision requested";
        const tone = isLast && passed ? "emerald" : "rose";
        return (
          <li key={attempt} className="flex items-center gap-3 rounded-lg border border-line bg-white/[0.02] px-3 py-2 text-[12.5px]">
            <RefreshCcw className="size-3.5 text-ink-faint" />
            <span className="text-ink-muted">Extraction pass {attempt}</span>
            <span className="ml-auto">
              <Badge tone={tone}>{outcome.toUpperCase()}</Badge>
            </span>
          </li>
        );
      })}
      {!passed && (
        <li className="rounded-lg border border-rose-400/25 bg-rose-500/[0.05] px-3 py-2.5">
          <Eyebrow className="mb-1.5 text-rose-300/80">Final critic findings</Eyebrow>
          <ul className="space-y-1">
            {critic.feedback.map((f, i) => (
              <li key={i} className="font-mono text-[11.5px] leading-relaxed text-rose-200/85">
                ✕ {f}
              </li>
            ))}
          </ul>
        </li>
      )}
    </ol>
  );
}

export function AuditTrailTab({ audit }: { audit: AuditResponse }) {
  const ticker = audit.run.ticker;
  const verified = audit.math_results.status === "VERIFIED";

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <Eyebrow className="mb-1">Audit run</Eyebrow>
          <div className="font-mono text-[12.5px] text-ink-muted">
            {audit.run.stages.join(" → ")} · {audit.run.duration_seconds}s · {audit.run.model} ·{" "}
            {new Date(audit.run.completed_at).toLocaleString("en-US", { timeZone: "UTC", timeZoneName: "short" })}
          </div>
        </div>
        <button
          onClick={() =>
            downloadFile(
              `${ticker}_audit_package.json`,
              JSON.stringify({ exported_at: new Date().toISOString(), disclaimer: "Upper-bound estimates; not legal or tax advice.", audit }, null, 2),
              "application/json",
            )
          }
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-400/[0.06] px-3.5 py-2 text-[12.5px] font-medium text-emerald-200 transition-colors hover:bg-emerald-400/[0.12]"
        >
          <ArrowDownToLine className="size-3.5" /> Full audit package (.json)
        </button>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <div className="min-w-0 space-y-5">
          <Collapsible title="Pydantic State · AuditedLiability" icon={<Braces className="size-4" />} badge={<Badge tone="sky">schemas.py</Badge>}>
            <JsonView value={audit.liability} />
          </Collapsible>
          <Collapsible title="Executive Pairing & Provenance" icon={<Database className="size-4" />}>
            <JsonView
              value={{
                parachute_executive: audit.parachute_executive,
                trade_executive: audit.trade_executive,
                extraction_sources: audit.extraction_sources,
                derived_fields: audit.derived_fields,
              }}
            />
          </Collapsible>
        </div>
        <div className="min-w-0 space-y-5">
          <Collapsible
            title="Critic Reflection Log"
            icon={<ScrollText className="size-4" />}
            badge={<Badge tone={verified ? "emerald" : "rose"}>{verified ? "GROUNDED" : "UNVERIFIED"}</Badge>}
          >
            <ReflectionLog audit={audit} />
            <JsonView value={audit.critic} maxHeight={240} />
          </Collapsible>
          <Collapsible title="Math Engine Outputs" icon={<FileCode2 className="size-4" />} badge={<Badge tone="neutral">math_engine.py</Badge>}>
            <JsonView value={audit.math_results} />
          </Collapsible>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Collapsible title="Source Filing · Form 4" icon={<Database className="size-4" />} defaultOpen={false}>
          <JsonView value={audit.trade_filing} />
        </Collapsible>
        <Collapsible title="Source Filing · DEF 14A & Payload Meta" icon={<Database className="size-4" />} defaultOpen={false}>
          <JsonView value={{ meta: audit.meta, def14a: audit.def14a }} />
        </Collapsible>
      </div>

      <Collapsible title="Rendered Memo · Markdown Source" icon={<ScrollText className="size-4" />} defaultOpen={false}>
        <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-[#070a0f] p-4 font-mono text-[11.5px] leading-[1.65] text-ink-muted">
          {audit.final_memo}
        </pre>
      </Collapsible>
    </div>
  );
}
