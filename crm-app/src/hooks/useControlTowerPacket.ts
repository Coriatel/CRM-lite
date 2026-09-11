import { useEffect, useState } from "react";

// The Owner Cockpit (/owner) reads ONE folded read model: control_tower_packet.json,
// the same packet the /ops Mission view (#179) and the Telegram shift manager consume.
// Built by ops-vault build-control-tower-packet.py. No second source of truth — every
// portal here either reads this packet or links out to an existing surface.
export const CONTROL_TOWER_PACKET_URL =
  "/ops-data/projections/control-tower/control_tower_packet.json";

const REFRESH_MS = 60_000;

export type CtConfidence = "FACT" | "INFERENCE";

export interface CtSection {
  confidence?: CtConfidence;
  route?: string;
  actions?: string[];
  source?: string;
}

export interface CtGate {
  id?: string;
  kind?: string;
  summary?: string;
  suggested_action?: string;
  reversibility?: string;
  status?: string;
  age_days?: number | null;
}

export interface CtOwnerBlocker {
  id?: string;
  summary?: string;
  needs?: string;
  age_days?: number | null;
}

export interface ControlTowerPacket {
  _meta?: { computed_at?: string; freshness?: string };
  now?: CtSection & {
    label?: string | null;
    rationale?: string;
    owner_gate?: boolean;
  };
  needs_you?: CtSection & {
    count?: number;
    gate_count?: number;
    oldest_age_days?: number | null;
    by_kind?: Record<string, number>;
    gates?: CtGate[];
    owner_blockers?: CtOwnerBlocker[];
  };
  next?: CtSection & {
    items?: { rank?: number; label?: string; campaign_id?: string }[];
    planned_total?: number;
  };
  health?: CtSection & {
    verdict?: string;
    surfaces_total?: number;
    surfaces_fresh?: number;
    surfaces_degraded?: number;
    producer_violations?: number;
  };
}

export interface ControlTowerPacketState {
  packet: ControlTowerPacket | null;
  fetchedAt: string | null;
  loading: boolean;
  /** True when the fetch failed or returned nothing — render the safe empty state. */
  unavailable: boolean;
}

async function fetchPacket(): Promise<ControlTowerPacket | null> {
  try {
    const r = await fetch(CONTROL_TOWER_PACKET_URL, { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as ControlTowerPacket;
  } catch {
    return null;
  }
}

/**
 * Single-source hook for the Owner Cockpit. Polls the folded packet every 60s.
 * Never throws: a missing/degraded packet resolves to { packet: null, unavailable: true }
 * so the page renders a safe "no data" state instead of crashing.
 */
export function useControlTowerPacket(): ControlTowerPacketState {
  const [packet, setPacket] = useState<ControlTowerPacket | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      const p = await fetchPacket();
      if (!alive) return;
      setPacket(p);
      setUnavailable(p == null);
      setFetchedAt(p?._meta?.computed_at ?? new Date().toISOString());
      setLoading(false);
    }
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return { packet, fetchedAt, loading, unavailable };
}
