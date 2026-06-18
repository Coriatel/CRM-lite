import { useEffect, useState } from "react";

// Read-only fetch of an /ops-data packet, mirroring ControlPanelPage's no-store +
// 30s refresh pattern. No writes, no producer interaction.
export function useOpsPacket<T>(url: string): { doc: T | null; loaded: boolean } {
  const [doc, setDoc] = useState<T | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const r = await fetch(url, { cache: "no-store" });
        if (!alive) return;
        setDoc(r.ok ? ((await r.json()) as T) : null);
      } catch {
        if (alive) setDoc(null);
      } finally {
        if (alive) setLoaded(true);
      }
    }
    void load();
    const id = window.setInterval(() => void load(), 30_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [url]);
  return { doc, loaded };
}
