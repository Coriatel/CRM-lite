import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useLoad } from "../useLoad";
import { MgLoading, MgNotice } from "../MgState";
import { SystemHead } from "./SystemHead";
import { getSystem } from "./systemApi";
import { mountAtlas } from "./atlas/engine.js";
import "./system.css";
import "./atlas/atlas.css";

// The atlas beside the existing System screens (owner 26.11: to get used to it before anything is replaced).
// It reads the same owner-only map as the other System screens; nothing is embedded in the bundle.
export function MgmtSystemAtlas() {
  const map = useLoad(() => getSystem("map"), []);
  const nav = useNavigate();
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!map.data || !host.current) return;
    const a = mountAtlas(host.current, map.data, { onExit: () => nav("/m/system") });
    return () => a.destroy();
  }, [map.data, nav]);

  if (map.data) return <div ref={host} className="atl" aria-label="אטלס המערכת" />;
  return (
    <>
      <SystemHead gen={undefined} />
      {map.error == null && <MgLoading />}
      {map.error != null && (
        <section className="mg-panel">
          <MgNotice error={map.error} onRetry={map.reload} />
        </section>
      )}
    </>
  );
}
