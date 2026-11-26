import { useLoad } from "../useLoad";
import { MgLoading, MgNotice } from "../MgState";
import { freshness } from "../format";
import { getSystem, type SystemMap, type SystemNode } from "./systemApi";

// Owner words only (owner 2026-11-26): never "מושבת" for something that works.
export const WORDS = { down: "לא עובד עכשיו", care: "עובד, צריך טיפול", maint: "תחזוקה" } as const;

export function statusKey(n: SystemNode): keyof typeof WORDS | "ok" | "other" {
  if (n.state === "works") return "ok";
  if (n.state === "maintenance") return "maint";
  if (n.state === "failing" || n.state === "not running") return "down";
  if (n.state === "stale") return "care";
  return "other";
}

export function MgmtSystemPage() {
  const map = useLoad<SystemMap>(() => getSystem("map"), []);
  const fresh = freshness(map.data?._meta?.generated_at ?? null);
  const counts = { down: 0, care: 0, maint: 0, ok: 0, other: 0 };
  for (const n of map.data?.nodes ?? []) counts[statusKey(n)]++;

  return (
    <>
      <div className="mg-page-head">
        <div className="mg-head-text">
          <h1>מערכת</h1>
          {map.data && (
            <p className={fresh.stale ? "mg-sub mg-stale" : "mg-sub"} role="status">
              {fresh.label}
            </p>
          )}
        </div>
      </div>
      <section className="mg-panel" aria-label="מצב המערכת">
        <div className="mg-panel-head">
          <h2>מצב עכשיו</h2>
        </div>
        {!map.loaded && map.error == null && <MgLoading />}
        {map.error != null && <MgNotice error={map.error} onRetry={map.reload} />}
        {map.data && (
          <ul className="mg-rows">
            <li className="mg-row">
              <bdi>{counts.down}</bdi> {WORDS.down}
            </li>
            <li className="mg-row">
              <bdi>{counts.care}</bdi> {WORDS.care}
            </li>
            <li className="mg-row">
              <bdi>{counts.maint}</bdi> {WORDS.maint}
            </li>
            <li className="mg-row">
              <bdi>{counts.ok}</bdi> עובדים, מתוך <bdi>{map.data.nodes.length}</bdi> רכיבים במפה
            </li>
          </ul>
        )}
      </section>
    </>
  );
}
