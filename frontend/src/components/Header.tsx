"use client";

import { useEffect, useState } from "react";
import { getHealth } from "@/lib/api";
import { prettyModel } from "@/lib/format";
import type { Health } from "@/lib/types";
import { Logo } from "./Logo";
import { PulseDot } from "./ui";

const HEALTH_POLL_MS = 15_000;

function Indicator({ tone, label, detail }: { tone: "emerald" | "sky" | "rose"; label: string; detail?: string }) {
  return (
    <div
      className="flex items-center gap-2 rounded-full border border-line bg-white/[0.02] px-3 py-1.5 text-[12px] text-ink-muted"
      title={detail}
    >
      <PulseDot tone={tone} />
      <span className="whitespace-nowrap">{label}</span>
    </div>
  );
}

export function Header() {
  const [health, setHealth] = useState<Health | null>(null);
  const [apiDown, setApiDown] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const result = await getHealth();
        if (!cancelled) {
          setHealth(result);
          setApiDown(false);
        }
      } catch {
        if (!cancelled) setApiDown(true);
      }
    };
    poll();
    const timer = setInterval(poll, HEALTH_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const model = health ? prettyModel(health.llm.model) : "Llama 3.1 8B";
  const llmOk = !apiDown && health?.llm.ok;
  const llmLabel = health?.llm.provider === "groq" ? `Groq (${model}) Cloud` : `Ollama (${model}) Local`;

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Logo />
        <div className="flex flex-wrap items-center gap-2">
          <Indicator
            tone={llmOk ? "emerald" : "rose"}
            label={apiDown ? "API offline" : llmLabel}
            detail={apiDown ? "Backend API is not reachable" : health?.llm.detail}
          />
          <Indicator
            tone={apiDown ? "rose" : "sky"}
            label={apiDown ? "LangGraph unavailable" : "LangGraph State Machine Active"}
            detail={health ? health.langgraph.stages.join(" → ") : undefined}
          />
        </div>
      </div>
    </header>
  );
}
