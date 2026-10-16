import type { ReactNode } from "react";
import { cn } from "@/lib/format";

export type Tone = "emerald" | "amber" | "rose" | "sky" | "neutral";

const badgeTones: Record<Tone, string> = {
  emerald: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/30",
  amber: "bg-amber-400/10 text-amber-300 ring-amber-400/30",
  rose: "bg-rose-500/10 text-rose-300 ring-rose-400/30",
  sky: "bg-sky-400/10 text-sky-300 ring-sky-400/30",
  neutral: "bg-white/5 text-ink-muted ring-white/10",
};

export function Badge({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[11px] font-medium tracking-wide ring-1 ring-inset",
        badgeTones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0 rounded-xl border border-line bg-surface/80 shadow-[0_1px_0_0_rgb(255_255_255/0.03)_inset] backdrop-blur-sm", className)}>
      {children}
    </div>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-ink-faint", className)}>
      {children}
    </div>
  );
}

export function SectionHeading({ icon, title, aside }: { icon?: ReactNode; title: string; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h3 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-ink">
        {icon && <span className="text-ink-muted">{icon}</span>}
        {title}
      </h3>
      {aside}
    </div>
  );
}

export function DataRow({
  label,
  value,
  emphasis,
  hint,
}: {
  label: ReactNode;
  value: ReactNode;
  emphasis?: boolean;
  hint?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-line py-2.5 last:border-b-0">
      <div className="min-w-0 text-[13px] text-ink-muted">
        {label}
        {hint && <div className="mt-0.5 text-[11.5px] text-ink-faint">{hint}</div>}
      </div>
      <div className={cn("shrink-0 text-right font-mono text-[13px] tabular-nums", emphasis ? "font-semibold text-ink" : "text-ink/90")}>
        {value}
      </div>
    </div>
  );
}

export function PulseDot({ tone }: { tone: "emerald" | "sky" | "rose" | "amber" }) {
  const colors = {
    emerald: "bg-emerald-400",
    sky: "bg-sky-400",
    rose: "bg-rose-400",
    amber: "bg-amber-400",
  }[tone];
  return (
    <span className="relative flex size-2">
      <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-60", colors)} />
      <span className={cn("relative inline-flex size-2 rounded-full", colors)} />
    </span>
  );
}
