import { useId } from "react";

/** Brandmark: a diligence lens whose glass holds three rising bars, emerald into sky. */
export function LogoMark({ size = 36 }: { size?: number }) {
  const id = useId().replace(/:/g, "");
  const stroke = `stroke-${id}`;
  const bars = `bars-${id}`;
  const glow = `glow-${id}`;
  const clip = `clip-${id}`;

  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={stroke} x1="6" y1="6" x2="34" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#34d399" />
          <stop offset="1" stopColor="#38bdf8" />
        </linearGradient>
        <linearGradient id={bars} x1="0" y1="26" x2="0" y2="10" gradientUnits="userSpaceOnUse">
          <stop stopColor="#10b981" stopOpacity="0.55" />
          <stop offset="1" stopColor="#6ee7b7" />
        </linearGradient>
        <filter id={glow} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <clipPath id={clip}>
          <circle cx="17" cy="17" r="9.6" />
        </clipPath>
      </defs>

      <rect x="0.5" y="0.5" width="39" height="39" rx="10" fill="#0b1118" stroke="rgb(255 255 255 / 0.08)" />

      <g filter={`url(#${glow})`}>
        {/* Lens */}
        <circle cx="17" cy="17" r="11" stroke={`url(#${stroke})`} strokeWidth="2" />
        {/* Handle */}
        <path d="M25.2 25.2 L32 32" stroke={`url(#${stroke})`} strokeWidth="3.2" strokeLinecap="round" />
      </g>

      {/* Rising bars, clipped to the glass */}
      <g clipPath={`url(#${clip})`}>
        <rect x="10.6" y="19.5" width="3" height="8" rx="0.8" fill={`url(#${bars})`} />
        <rect x="15.5" y="15.5" width="3" height="12" rx="0.8" fill={`url(#${bars})`} />
        <rect x="20.4" y="11.5" width="3" height="16" rx="0.8" fill={`url(#${bars})`} />
      </g>

      {/* Trend tick above the tallest bar */}
      <circle cx="21.9" cy="9.6" r="1.1" fill="#a7f3d0" />
    </svg>
  );
}

export function Logo() {
  return (
    <div className="flex items-center gap-3">
      <LogoMark />
      <div className="flex items-baseline gap-2">
        <span className="text-[17px] font-semibold tracking-[-0.02em] text-ink">
          Int
          <span className="bg-gradient-to-r from-emerald-300 to-sky-300 bg-clip-text text-transparent">Diligence</span>
        </span>
        <span className="rounded border border-line px-1.5 py-px font-mono text-[9.5px] font-medium uppercase tracking-[0.12em] text-ink-faint">
          v2.4 Enterprise
        </span>
      </div>
    </div>
  );
}
