/**
 * Donor money summary, derived read-only from `transactions` where
 * `direction=income`. `transactions` is the canonical money ledger
 * (verified 2026-05-20 probe: 1,014 income / 731 attributable / 120 distinct
 * donors / 100% name-join resolution). `project_donations` is empty in prod
 * and is not the source.
 *
 * `aggregateDonorSummary` is pure for unit testing; `fetchDonorSummary`
 * wraps it over the Directus reader in `services/directus.ts`.
 */

import { getIncomeTransactions } from "../services/directus";

export interface DonorTransactionRow {
  id: string;
  amount: string | number;
  date: string;
  contact_id: { id: string; full_name: string } | null;
}

export interface DonorSummary {
  contact_id: string;
  full_name: string;
  total_year: number;
  total_lifetime: number;
  last_gift_at: string;
  last_gift_amount: number;
  gift_count_lifetime: number;
}

export interface DonorSummaryFeed {
  donors: DonorSummary[];
  generated_at: string;
  current_year: number;
  total_donors_attributable: number;
  anonymous_gift_count: number;
  anonymous_gift_sum: number;
  source: "transactions";
}

function parseAmount(raw: string | number): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function aggregateDonorSummary(
  rows: DonorTransactionRow[],
  now: Date = new Date(),
): DonorSummaryFeed {
  const currentYear = now.getUTCFullYear();
  const yearStartIso = new Date(Date.UTC(currentYear, 0, 1)).toISOString();

  const perDonor = new Map<string, DonorSummary>();
  let anonymousCount = 0;
  let anonymousSum = 0;

  for (const row of rows) {
    const amount = parseAmount(row.amount);
    if (!row.contact_id) {
      anonymousCount += 1;
      anonymousSum += amount;
      continue;
    }
    const contactId = row.contact_id.id;
    const fullName = row.contact_id.full_name ?? "";
    const existing = perDonor.get(contactId);
    if (existing) {
      existing.total_lifetime += amount;
      if (row.date >= yearStartIso) existing.total_year += amount;
      existing.gift_count_lifetime += 1;
      if (row.date > existing.last_gift_at) {
        existing.last_gift_at = row.date;
        existing.last_gift_amount = amount;
      }
    } else {
      perDonor.set(contactId, {
        contact_id: contactId,
        full_name: fullName,
        total_year: row.date >= yearStartIso ? amount : 0,
        total_lifetime: amount,
        last_gift_at: row.date,
        last_gift_amount: amount,
        gift_count_lifetime: 1,
      });
    }
  }

  const donors = Array.from(perDonor.values()).sort((a, b) => {
    if (b.total_year !== a.total_year) return b.total_year - a.total_year;
    if (b.total_lifetime !== a.total_lifetime)
      return b.total_lifetime - a.total_lifetime;
    return a.contact_id.localeCompare(b.contact_id);
  });

  return {
    donors,
    generated_at: now.toISOString(),
    current_year: currentYear,
    total_donors_attributable: donors.length,
    anonymous_gift_count: anonymousCount,
    anonymous_gift_sum: anonymousSum,
    source: "transactions",
  };
}

export async function fetchDonorSummary(
  now: Date = new Date(),
): Promise<DonorSummaryFeed> {
  const rows = await getIncomeTransactions();
  return aggregateDonorSummary(rows, now);
}
