export interface Health {
  llm: { ok: boolean; provider: "ollama" | "groq"; model: string; detail: string };
  langgraph: { ok: boolean; stages: string[] };
  cache: { ok: boolean; tickers: string[] };
}

export interface Liability {
  liability_type: string;
  executive_name: string;
  amount_usd: number;
  base_compensation: number | null;
  parachute_payment: number | null;
  adoption_date: string | null;
  transaction_date: string | null;
  exact_footnote_quote: string;
}

export interface Result280G {
  status?: "UNVERIFIED";
  reason?: string;
  error?: string;
  base_compensation_note?: string;
  base_compensation?: number;
  parachute_payment?: number;
  base_3x_threshold?: number;
  is_excess?: boolean;
  excess_parachute?: number;
  excise_tax_20pct?: number;
  disallowed_corporate_deduction?: number;
  corporate_tax_cash_cost_21pct?: number;
}

export interface Result10b51 {
  error?: string;
  adoption_date?: string;
  transaction_date?: string;
  earnings_filing_date?: string | null;
  is_officer?: boolean;
  required_days?: number;
  delta_days?: number;
  is_compliant?: boolean;
  verification_status?: string;
  violation_reason?: string | null;
}

export interface DerivedField {
  value: number | string | null;
  label: string;
  method: string;
  components?: number[];
}

export interface AuditResponse {
  run: { ticker: string; completed_at: string; duration_seconds: number; model: string; provider?: "ollama" | "groq"; stages: string[] };
  meta: {
    description?: string;
    is_mock?: boolean;
    ticker?: string;
    company_name?: string;
    cik?: string;
    fetched_at?: string;
    fallback_reason?: string;
  };
  parachute_executive: { name: string | null; source: string; pairing_basis: string; same_person_as_trader: boolean };
  trade_executive: { name: string | null; title: string | null; form4_accession_number: string | null };
  liability: Liability | null;
  extraction_sources: Record<string, string>;
  derived_fields: { amount_usd?: DerivedField; transaction_date?: DerivedField };
  critic: { iteration_count: number; needs_revision: boolean; compensation_verified: boolean; feedback: string[] };
  math_results: { status?: "VERIFIED" | "UNVERIFIED"; reason?: string; irc_280g: Result280G; rule_10b5_1: Result10b51 };
  memo_sections: {
    executive_summary?: string[];
    risk_mitigation?: string[];
    open_items?: string[];
    stray_figures?: string[];
  };
  final_memo: string;
  sensitivity: {
    multiplier: number;
    parachute_payment: number;
    excise_tax_20pct: number;
    corporate_tax_cash_cost_21pct: number;
  }[];
  trade_filing: {
    accession_number?: string;
    filing_date?: string;
    footnotes?: Record<string, string>;
    transactions?: {
      transaction_date: string;
      transaction_code: string;
      shares: number | null;
      price_per_share: number | null;
      transaction_amount: number | null;
      footnote_ids: string[];
    }[];
    [key: string]: unknown;
  };
  def14a: { accession_number?: string; filing_date?: string; peo_name?: string; [key: string]: unknown };
}
