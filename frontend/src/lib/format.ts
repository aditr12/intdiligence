import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const usdFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const compactFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

export const usd = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? usdFormatter.format(value) : "—";

export const usdCompact = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? compactFormatter.format(value) : "—";

export const signedUsd = (value: number) => (value > 0 ? "+" : "") + usd(value);

/** "llama3.1:8b" -> "Llama 3.1 8B", "openai/gpt-oss-120b" -> "GPT-OSS 120B"; other model names pass through. */
export function prettyModel(model: string) {
  const llama = /^llama-?(\d+(?:\.\d+)?)[:-](\d+)b(?:-[a-z]+)?$/i.exec(model);
  if (llama) return `Llama ${llama[1]} ${llama[2]}B`;
  const gptOss = /^(?:openai\/)?gpt-oss-(\d+)b$/i.exec(model);
  if (gptOss) return `GPT-OSS ${gptOss[1]}B`;
  return model;
}

export function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function formatDate(isoDate: string | null | undefined) {
  if (!isoDate) return "—";
  const date = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export function downloadFile(filename: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Splits "PRELIMINARY_PASS (Requires ...)" into its code and parenthetical note. */
export function splitStatus(status: string | undefined) {
  if (!status) return { code: "NOT_VERIFIED", note: "" };
  const match = /^([A-Z_]+)\s*(?:\((.*)\))?$/.exec(status);
  return match ? { code: match[1], note: match[2] ?? "" } : { code: status, note: "" };
}
