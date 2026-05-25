// HYBRID blockers: splits the live attention feed into two semantically distinct lanes —
// owner-curated blockers (source = blockers.json, the owner's explicit authority list) vs
// runtime-derived blockers/gaps (source = governance-debt / runtime-issues, machine-detected).
// Consumes the already-fetched attention_synthesis.json only; adds no producer. Advisory
// display per the attention-synthesis contract — never gate on this.

import type {
  AttentionSynthItem,
  AttentionSynthesisDoc,
} from "./AttentionSynthesisCard";

const OWNER_SOURCE = "blockers";
const RUNTIME_SOURCES = new Set(["governance-debt", "runtime-issues"]);

export interface HybridBlockerLanes {
  ownerCurated: AttentionSynthItem[];
  runtimeDerived: AttentionSynthItem[];
}

// Machine-derived items must NEVER overwrite owner-curated ones: the partition is by the
// producer-assigned `source` field, so an owner blocker can only ever land in the owner lane.
export function partitionHybridBlockers(
  doc: AttentionSynthesisDoc | null,
): HybridBlockerLanes {
  const items = doc?.items ?? [];
  const byRank = (a: AttentionSynthItem, b: AttentionSynthItem) =>
    (b.rank_score ?? 0) - (a.rank_score ?? 0);
  return {
    ownerCurated: items.filter((it) => it.source === OWNER_SOURCE).sort(byRank),
    runtimeDerived: items
      .filter((it) => RUNTIME_SOURCES.has(it.source))
      .sort(byRank),
  };
}

const cardStyle: React.CSSProperties = {
  border: "1px solid #e5e5e5",
  borderRadius: 10,
  padding: 12,
  marginBottom: 12,
  background: "var(--color-card, #fff)",
};

const headStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 8,
  gap: 8,
  flexWrap: "wrap",
};

const badge: React.CSSProperties = {
  color: "#fff",
  fontSize: 11,
  padding: "2px 8px",
  borderRadius: 999,
  whiteSpace: "nowrap",
};

const ltr: React.CSSProperties = { direction: "ltr", unicodeBidi: "isolate" };

function BlockerRow({ it, accent }: { it: AttentionSynthItem; accent: string }) {
  // owner_required is asserted ONLY from producer evidence (gate_role === "owner").
  // Runtime items carry no gate_role, so they are never labelled owner-required here.
  const ownerRequired = it.gate_role === "owner";
  return (
    <li
      style={{
        padding: "8px 0",
        borderTop: "1px solid #f0f0f0",
        borderInlineStart: `3px solid ${accent}`,
        paddingInlineStart: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        {ownerRequired && <span style={{ ...badge, background: "#7c3aed" }}>דרוש אונר</span>}
        <span style={{ fontSize: 14, fontWeight: 600 }}>{it.title}</span>
      </div>
      {it.next_action && (
        <div style={{ fontSize: 13, color: "#374151", marginTop: 2 }}>← {it.next_action}</div>
      )}
      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
        {it.source_ref && (
          <span style={ltr} title="נתיב הראיה">
            {it.source_ref}
          </span>
        )}
        {typeof it.stale_days === "number" && it.stale_days > 0
          ? ` · ${it.stale_days} ימים`
          : ""}
        {typeof it.rank_score === "number" ? ` · דירוג ${it.rank_score}` : ""}
        {it.lifecycle ? <span style={ltr}>{` · ${it.lifecycle}`}</span> : ""}
      </div>
    </li>
  );
}

function Lane({
  title,
  hint,
  accent,
  items,
  emptyText,
  listId,
}: {
  title: string;
  hint: string;
  accent: string;
  items: AttentionSynthItem[];
  emptyText: string;
  listId: string;
}) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ ...badge, background: accent }}>{title}</span>
        <span style={{ fontSize: 11, color: "#9ca3af" }}>{hint}</span>
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 13, color: "#16a34a", marginTop: 6 }}>{emptyText}</div>
      ) : (
        <ul id={listId} style={{ listStyle: "none", padding: 0, margin: "6px 0 0" }}>
          {items.map((it) => (
            <BlockerRow key={it.id} it={it} accent={accent} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function HybridBlockersCard({ doc }: { doc: AttentionSynthesisDoc | null }) {
  if (!doc) {
    return (
      <section style={cardStyle} aria-label="חסמים — אונר מול ריצה">
        <div style={headStyle}>
          <strong style={{ fontSize: 16 }}>חסמים — מקוריים מול נגזרי־ריצה</strong>
        </div>
        <div style={{ fontSize: 13, color: "#737373" }}>
          אין נתוני סינתזה — האם{" "}
          <code style={ltr}>state/attention_synthesis.json</code> נכתב?
        </div>
      </section>
    );
  }

  const { ownerCurated, runtimeDerived } = partitionHybridBlockers(doc);

  return (
    <section style={cardStyle} aria-label="חסמים — אונר מול ריצה">
      <div style={headStyle}>
        <strong style={{ fontSize: 16 }}>חסמים — מקוריים מול נגזרי־ריצה</strong>
        <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {ownerCurated.length > 0 && (
            <span style={{ ...badge, background: "#7c3aed" }}>אונר {ownerCurated.length}</span>
          )}
          {runtimeDerived.length > 0 && (
            <span style={{ ...badge, background: "#0891b2" }}>ריצה {runtimeDerived.length}</span>
          )}
        </span>
      </div>

      <Lane
        title="חסמים מקוריים (אונר)"
        hint="מקור: blockers.json — חסמים מפורשים של הבעלים"
        accent="#7c3aed"
        items={ownerCurated}
        emptyText="אין חסמים מקוריים פתוחים."
        listId="hybrid-blockers-owner"
      />

      <Lane
        title="נגזרי־ריצה (זוהו אוטומטית)"
        hint="מקור: governance-debt / runtime-issues — זוהו על־ידי המערכת, לא הוחלטו על־ידי הבעלים"
        accent="#0891b2"
        items={runtimeDerived}
        emptyText="אין חסמים נגזרי־ריצה פתוחים."
        listId="hybrid-blockers-runtime"
      />
    </section>
  );
}
