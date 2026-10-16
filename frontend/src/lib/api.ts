import type { AuditResponse, Health, Result280G } from "./types";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(`Cannot reach the IntDiligence API at ${API_BASE}. Is the backend running?`, 0);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(body.detail ?? `Request failed (HTTP ${response.status})`, response.status);
  }
  return response.json() as Promise<T>;
}

export const getHealth = (signal?: AbortSignal) => request<Health>("/api/health", { signal });

export const runAudit = (ticker: string, signal?: AbortSignal) =>
  request<AuditResponse>("/api/audit", { method: "POST", body: JSON.stringify({ ticker }), signal });

export const calculate280G = (base_compensation: number, parachute_payment: number, signal?: AbortSignal) =>
  request<Result280G>("/api/calculate/280g", {
    method: "POST",
    body: JSON.stringify({ base_compensation, parachute_payment }),
    signal,
  });
