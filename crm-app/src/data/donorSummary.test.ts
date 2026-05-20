import { describe, expect, it } from "vitest";
import {
  aggregateDonorSummary,
  type DonorTransactionRow,
} from "./donorSummary";

const NOW = new Date("2026-05-20T10:00:00Z");

function row(
  overrides: Partial<DonorTransactionRow> & {
    id: string;
    amount: string | number;
    date: string;
  },
): DonorTransactionRow {
  return {
    contact_id: null,
    ...overrides,
  };
}

function donor(id: string, name = `donor-${id}`) {
  return { id, full_name: name };
}

describe("aggregateDonorSummary", () => {
  it("returns empty feed for empty input", () => {
    const feed = aggregateDonorSummary([], NOW);
    expect(feed.donors).toEqual([]);
    expect(feed.anonymous_gift_count).toBe(0);
    expect(feed.anonymous_gift_sum).toBe(0);
    expect(feed.total_donors_attributable).toBe(0);
    expect(feed.current_year).toBe(2026);
    expect(feed.source).toBe("transactions");
  });

  it("buckets anonymous gifts separately and sums them", () => {
    const feed = aggregateDonorSummary(
      [
        row({ id: "a", amount: "100.00", date: "2026-03-01T00:00:00Z" }),
        row({ id: "b", amount: "50", date: "2025-12-15T00:00:00Z" }),
        row({ id: "c", amount: 200, date: "2026-04-01T00:00:00Z" }),
      ],
      NOW,
    );
    expect(feed.donors).toEqual([]);
    expect(feed.anonymous_gift_count).toBe(3);
    expect(feed.anonymous_gift_sum).toBe(350);
  });

  it("aggregates lifetime, current-year, last-gift and count per donor", () => {
    const feed = aggregateDonorSummary(
      [
        row({
          id: "1",
          amount: "100",
          date: "2024-05-01T00:00:00Z",
          contact_id: donor("d1", "אלישבע"),
        }),
        row({
          id: "2",
          amount: "200",
          date: "2026-04-01T00:00:00Z",
          contact_id: donor("d1"),
        }),
        row({
          id: "3",
          amount: "50",
          date: "2026-05-15T12:00:00Z",
          contact_id: donor("d1"),
        }),
      ],
      NOW,
    );
    expect(feed.donors).toHaveLength(1);
    const d = feed.donors[0];
    expect(d.contact_id).toBe("d1");
    expect(d.full_name).toBe("אלישבע");
    expect(d.total_lifetime).toBe(350);
    expect(d.total_year).toBe(250);
    expect(d.gift_count_lifetime).toBe(3);
    expect(d.last_gift_at).toBe("2026-05-15T12:00:00Z");
    expect(d.last_gift_amount).toBe(50);
    expect(d.last_gift_transaction_id).toBe("3");
  });

  it("sorts donors by total_year desc, then total_lifetime desc, then id", () => {
    const feed = aggregateDonorSummary(
      [
        row({
          id: "1",
          amount: "500",
          date: "2024-01-01T00:00:00Z",
          contact_id: donor("low-year-high-lifetime"),
        }),
        row({
          id: "2",
          amount: "100",
          date: "2026-01-15T00:00:00Z",
          contact_id: donor("z-id"),
        }),
        row({
          id: "3",
          amount: "100",
          date: "2026-02-15T00:00:00Z",
          contact_id: donor("a-id"),
        }),
        row({
          id: "4",
          amount: "300",
          date: "2026-03-15T00:00:00Z",
          contact_id: donor("top"),
        }),
      ],
      NOW,
    );
    expect(feed.donors.map((d) => d.contact_id)).toEqual([
      "top",
      "a-id",
      "z-id",
      "low-year-high-lifetime",
    ]);
  });

  it("excludes prior-year gifts from total_year while keeping lifetime", () => {
    const feed = aggregateDonorSummary(
      [
        row({
          id: "1",
          amount: "1000",
          date: "2025-12-31T23:59:59Z",
          contact_id: donor("d"),
        }),
        row({
          id: "2",
          amount: "10",
          date: "2026-01-01T00:00:00Z",
          contact_id: donor("d"),
        }),
      ],
      NOW,
    );
    expect(feed.donors[0].total_lifetime).toBe(1010);
    expect(feed.donors[0].total_year).toBe(10);
  });

  it("mixes attributable and anonymous gifts", () => {
    const feed = aggregateDonorSummary(
      [
        row({
          id: "1",
          amount: "100",
          date: "2026-04-01T00:00:00Z",
          contact_id: donor("d1"),
        }),
        row({ id: "2", amount: "50", date: "2026-04-02T00:00:00Z" }),
        row({
          id: "3",
          amount: "75",
          date: "2026-04-03T00:00:00Z",
          contact_id: donor("d2"),
        }),
      ],
      NOW,
    );
    expect(feed.donors).toHaveLength(2);
    expect(feed.total_donors_attributable).toBe(2);
    expect(feed.anonymous_gift_count).toBe(1);
    expect(feed.anonymous_gift_sum).toBe(50);
  });

  it("tolerates non-numeric amount strings without throwing", () => {
    const feed = aggregateDonorSummary(
      [
        row({
          id: "1",
          amount: "not-a-number",
          date: "2026-04-01T00:00:00Z",
          contact_id: donor("d1"),
        }),
        row({
          id: "2",
          amount: "100",
          date: "2026-04-02T00:00:00Z",
          contact_id: donor("d1"),
        }),
      ],
      NOW,
    );
    expect(feed.donors[0].total_lifetime).toBe(100);
    expect(feed.donors[0].gift_count_lifetime).toBe(2);
  });

  it("uses utc year for current_year and stamps generated_at", () => {
    const feed = aggregateDonorSummary([], NOW);
    expect(feed.current_year).toBe(2026);
    expect(feed.generated_at).toBe(NOW.toISOString());
  });
});
