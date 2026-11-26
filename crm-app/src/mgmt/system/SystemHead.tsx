import { NavLink } from "react-router-dom";
import { freshness } from "../format";

// The page title and the sub-tabs of the System tab (mockup v4d). Only views that exist are listed.
export function SystemHead({ gen }: { gen: string | null | undefined }) {
  const fresh = freshness(gen ?? null);
  return (
    <>
      <div className="mg-page-head">
        <div className="mg-head-text">
          <h1>מערכת</h1>
          {gen !== undefined && (
            <p className={fresh.stale ? "mg-sub mg-stale" : "mg-sub"} role="status">
              {fresh.label}
            </p>
          )}
        </div>
      </div>
      <nav className="sy-tabs" aria-label="תצוגות המערכת">
        <NavLink to="/m/system" end>תמונת מצב</NavLink>
        <NavLink to="/m/system/all">
          <span className="sy-d">כל מה שיש במערכת</span>
          <span className="sy-m">כל מה שיש</span>
        </NavLink>
      </nav>
    </>
  );
}
