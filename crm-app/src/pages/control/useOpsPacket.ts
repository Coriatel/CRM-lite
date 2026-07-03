import { useEffect, useState } from "react";

// Tag <body> while a Control-Tower surface is mounted so the scoped controlChrome.css
// dark-themes the global bottom nav only here. Reverts on unmount → other screens stay light.
export function useDarkChrome() {
  useEffect(() => {
    document.body.classList.add("ct-dark-chrome");
    return () => document.body.classList.remove("ct-dark-chrome");
  }, []);
}

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
