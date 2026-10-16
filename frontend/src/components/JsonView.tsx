"use client";

import { Check, Copy } from "lucide-react";
import { useMemo, useState } from "react";

const TOKEN = /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g;

function tokenClass(token: string) {
  if (token.startsWith('"')) return token.trimEnd().endsWith(":") ? "text-sky-300" : "text-emerald-300";
  if (token === "true" || token === "false") return "text-violet-300";
  if (token === "null") return "text-ink-faint";
  return "text-amber-300";
}

/** Pretty-printed, syntax-highlighted JSON. */
export function JsonView({ value, maxHeight = 420 }: { value: unknown; maxHeight?: number }) {
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => JSON.stringify(value, null, 2) ?? "null", [value]);
  const nodes = useMemo(() => {
    const parts: React.ReactNode[] = [];
    let last = 0;
    for (const match of text.matchAll(TOKEN)) {
      const index = match.index ?? 0;
      if (index > last) parts.push(text.slice(last, index));
      parts.push(
        <span key={index} className={tokenClass(match[0])}>
          {match[0]}
        </span>,
      );
      last = index + match[0].length;
    }
    parts.push(text.slice(last));
    return parts;
  }, [text]);

  return (
    <div className="group relative">
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
        className="absolute right-2 top-2 z-10 rounded-md border border-line bg-surface-2 p-1.5 text-ink-faint opacity-0 transition-opacity hover:text-ink group-hover:opacity-100 focus-visible:opacity-100"
        aria-label="Copy JSON"
      >
        {copied ? <Check className="size-3.5 text-emerald-300" /> : <Copy className="size-3.5" />}
      </button>
      <pre
        className="overflow-auto rounded-lg border border-line bg-[#070a0f] p-4 font-mono text-[11.5px] leading-[1.65] text-ink-muted"
        style={{ maxHeight }}
      >
        <code>{nodes}</code>
      </pre>
    </div>
  );
}
