import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { aggregateDonorSummary, type DonorSummaryFeed } from "../data/donorSummary";
import { getIncomeTransactions } from "../services/directus";
import { MgLoading, MgNotice } from "./MgState";
import { freshness, fullDate, shekels } from "./format";

const PAGE = 50;
const COLS = "minmax(9rem,1.4fr) minmax(9rem,1fr) 8rem 8rem 7rem";

export function MgmtDonorsPage() {
  const [feed, setFeed] = useState<DonorSummaryFeed | null>(null);
  const [latest, setLatest] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    let cancelled = false;
    setFeed(null);
    setError(null);
    getIncomeTransactions()
      .then((rows) => {
        if (cancelled) return;
        // Newest income record of any kind, with or without a contact.
        setLatest(rows.reduce((max, r) => (r.date > max ? r.date : max), "") || null);
        setFeed(aggregateDonorSummary(rows));
      })
      .catch((e) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const view = useMemo(() => {
    if (!feed) return null;
    const active = feed.donors.filter((d) => d.total_year > 0);
    const q = query.trim();
    return {
      fresh: freshness(latest),
      yearSum: active.reduce((sum, d) => sum + d.total_year, 0),
      activeCount: active.length,
      rows: q ? feed.donors.filter((d) => d.full_name.includes(q)) : feed.donors,
    };
  }, [feed, latest, query]);

  return (
    <>
      <div className="mg-page-head">
        <div className="mg-head-text">
          <h1>תורמים ותרומות</h1>
          {view && (
            <p className={view.fresh.stale ? "mg-sub mg-stale" : "mg-sub"} role="status">
              {view.fresh.label}
            </p>
          )}
        </div>
      </div>

      {error ? (
        <section className="mg-panel">
          <MgNotice error={error} onRetry={() => setReload((n) => n + 1)} />
        </section>
      ) : !feed || !view ? (
        <section className="mg-panel">
          <MgLoading />
        </section>
      ) : (
        <>
          <section className="mg-panel" aria-labelledby="mg-d-sum">
            <div className="mg-panel-head">
              <h2 id="mg-d-sum">סיכום {feed.current_year}</h2>
              <span className="mg-end mg-module-tag">כל התנועות שנרשמו, לפני אימות</span>
            </div>
            <dl className="mg-sum">
              <div className="mg-kv">
                <dt>תרומות ב־{feed.current_year}</dt>
                <dd>{shekels(view.yearSum)}</dd>
              </div>
              <div className="mg-kv">
                <dt>תורמים ב־{feed.current_year}</dt>
                <dd>{view.activeCount}</dd>
              </div>
              <div className="mg-kv">
                <dt>תורמים בכל השנים</dt>
                <dd>{feed.total_donors_attributable}</dd>
              </div>
              <div className="mg-kv">
                <dt>תרומות בלי איש קשר</dt>
                <dd>
                  {feed.anonymous_gift_count > 0 ? (
                    `${feed.anonymous_gift_count === 1 ? "תרומה אחת" : `${feed.anonymous_gift_count} תרומות`} · ${shekels(feed.anonymous_gift_sum)}`
                  ) : (
                    <span className="mg-plain">אין</span>
                  )}
                </dd>
              </div>
            </dl>
          </section>

          <form className="mg-search" role="search" onSubmit={(e) => e.preventDefault()}>
            <label className="mg-sr-only" htmlFor="mg-dq">
              חיפוש תורם/ת
            </label>
            <input
              id="mg-dq"
              type="search"
              placeholder="חיפוש תורם/ת"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShown(PAGE);
              }}
            />
          </form>

          <section
            className="mg-panel mg-tbl"
            style={{ ["--cols" as string]: COLS }}
            aria-label="רשימת תורמים"
          >
            <div className="mg-tbl-head">
              <span>שם</span>
              <span>תרומה אחרונה</span>
              <span>ב־{feed.current_year}</span>
              <span>בכל השנים</span>
              <span>תרומות</span>
            </div>
            {view.rows.length === 0 ? (
              <MgNotice empty={query.trim() ? "לא נמצאו תורמים בשם הזה." : "עדיין לא נרשמו תרומות."} />
            ) : (
              view.rows.slice(0, shown).map((d) => (
                <div className="mg-trow" key={d.contact_id}>
                  <p className="mg-c-name">
                    <Link to={`/m/people/${d.contact_id}`}>{d.full_name || "ללא שם"}</Link>
                  </p>
                  <p className="mg-c-sub">
                    <span className="mg-lbl">תרומה אחרונה: </span>
                    {shekels(d.last_gift_amount)} · <bdi>{fullDate(d.last_gift_at)}</bdi>
                  </p>
                  <p className={d.total_year > 0 ? "mg-c-sub mg-num" : "mg-c-sub mg-num mg-wide-only"}>
                    <span className="mg-lbl">ב־{feed.current_year}: </span>
                    {d.total_year > 0 ? shekels(d.total_year) : <span className="mg-plain">—</span>}
                  </p>
                  <p className="mg-c-sub mg-num">
                    <span className="mg-lbl">בכל השנים: </span>
                    {shekels(d.total_lifetime)}
                  </p>
                  <p className="mg-c-sub mg-wide-only">{d.gift_count_lifetime}</p>
                </div>
              ))
            )}
            {view.rows.length > shown && (
              <div className="mg-panel-foot">
                <button className="mg-link-act" type="button" onClick={() => setShown((n) => n + PAGE)}>
                  הצגת {Math.min(PAGE, view.rows.length - shown)} הבאים
                </button>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
