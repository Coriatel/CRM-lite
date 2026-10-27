import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Cross-page hash scroll. React Router navigates to `/ops#ops-card-blockers` but
 * does not scroll to the target — and the target page (e.g. the Ops cockpit)
 * renders asynchronously, so the element often does not exist on the first frame.
 * This retries for a few seconds until the id appears, then scrolls to it.
 *
 * Mounted once near the router root; a no-hash navigation is a no-op.
 */
export function ScrollToHash() {
  const { hash } = useLocation();

  useEffect(() => {
    if (!hash) return;
    const id = decodeURIComponent(hash.slice(1));
    if (!id) return;

    let cancelled = false;
    const startedAt = Date.now();

    const tryScroll = () => {
      if (cancelled) return;
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      // The Ops cockpit is heavy/async — keep retrying briefly until it renders.
      if (Date.now() - startedAt < 3000) {
        setTimeout(tryScroll, 100);
      }
    };

    tryScroll();
    return () => {
      cancelled = true;
    };
  }, [hash]);

  return null;
}
