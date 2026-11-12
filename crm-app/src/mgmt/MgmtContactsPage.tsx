import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  getContactsPaged,
  MG_UNCLASSIFIED,
  type MgContactRow,
} from "../services/directus";
import { useDebounce } from "../hooks/useDebounce";
import { newContactSaver, type NewContactResult } from "./newContact";
import { EditContactModal } from "../components/EditContactModal";
import { MgLoading, MgNotice } from "./MgState";
import { classificationLabel, displayPhone, fullDate, relDay, telHref } from "./format";

const PAGE = 50;
const FILTERS = [
  { value: "", label: "הכול" },
  { value: "donor", label: "תורמים" },
  { value: "lead", label: "מתעניינים" },
  { value: MG_UNCLASSIFIED, label: "בלי סיווג" },
];
const COLS =
  "minmax(9rem,1.4fr) 8.5rem minmax(7rem,1fr) minmax(7rem,1fr) minmax(7rem,1fr) 6rem";

export function MgmtContactsPage() {
  const [query, setQuery] = useState("");
  const search = useDebounce(query, 300);
  const [classification, setClassification] = useState("");
  const [rows, setRows] = useState<MgContactRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [reload, setReload] = useState(0);
  const [adding, setAdding] = useState(false);
  const [more, setMore] = useState<"" | "busy" | "failed">("");
  // Which search+filter the list on screen belongs to; a late page for another one is dropped.
  const listKey = useRef("");
  const saver = useRef(newContactSaver());
  const [saved, setSaved] = useState<NewContactResult | null>(null);

  function afterSave(result: NewContactResult | null) {
    setSaved(result);
    if (result && result.kind !== "exists") setReload((n) => n + 1);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMore("");
    listKey.current = `${search}\n${classification}\n${reload}`;
    getContactsPaged({ search, classification, limit: PAGE })
      .then((page) => {
        if (cancelled) return;
        setRows(page.rows);
        setTotal(page.total);
      })
      .catch((e) => !cancelled && setError(e))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [search, classification, reload]);

  const loadMore = useCallback(async () => {
    const key = listKey.current;
    setMore("busy");
    try {
      const page = await getContactsPaged({
        search,
        classification,
        limit: PAGE,
        offset: rows.length,
      });
      if (listKey.current !== key) return;
      setRows((prev) => [...prev, ...page.rows]);
      setTotal(page.total);
      setMore("");
    } catch {
      if (listKey.current === key) setMore("failed");
    }
  }, [search, classification, rows.length]);

  const remaining = total - rows.length;

  return (
    <>
      <div className="mg-page-head">
        <div className="mg-head-text">
          <h1>אנשי קשר</h1>
          {!loading && !error && (
            <p className="mg-sub">
              {total.toLocaleString("en-US")} אנשים · מוצגים {rows.length}
            </p>
          )}
        </div>
        <div className="mg-head-actions">
          <button className="mg-btn mg-btn-cta" type="button" onClick={() => setAdding(true)}>
            איש קשר חדש
          </button>
        </div>
      </div>

      {saved && (
        <p className="mg-panel" role="status">
          {saved.kind === "exists" && "כבר קיים איש קשר עם הטלפון הזה, ולכן לא נוצר חדש: "}
          {saved.kind === "created" && "נשמר: "}
          {saved.kind === "untagged" && "איש הקשר נשמר, אבל השיוך לקטגוריה לא נשמר: "}
          {saved.id ? (
            <Link to={`/m/people/${saved.id}`}>{saved.name || "ללא שם"}</Link>
          ) : (
            saved.name
          )}
          {saved.kind === "untagged" && (
            <>
              {" "}
              <button
                className="mg-link-act"
                type="button"
                onClick={async () => afterSave(await saver.current.retryTag())}
              >
                ניסיון נוסף לשיוך
              </button>
            </>
          )}
        </p>
      )}

      <form className="mg-search" role="search" onSubmit={(e) => e.preventDefault()}>
        <label className="mg-sr-only" htmlFor="mg-q">
          חיפוש
        </label>
        <input
          id="mg-q"
          type="search"
          placeholder='שם, טלפון או דוא"ל'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </form>
      <div className="mg-filters" role="group" aria-label="סינון לפי סיווג">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={classification === f.value}
            onClick={() => setClassification(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <section
        className="mg-panel mg-tbl"
        style={{ ["--cols" as string]: COLS }}
        aria-label="רשימת אנשי קשר"
      >
        <div className="mg-tbl-head">
          <span>שם</span>
          <span>טלפון</span>
          <span>סיווג</span>
          <span>קשר אחרון</span>
          <span>אחראי/ת</span>
          <span></span>
        </div>
        {loading ? (
          <MgLoading />
        ) : error ? (
          <MgNotice error={error} onRetry={() => setReload((n) => n + 1)} />
        ) : rows.length === 0 ? (
          <MgNotice empty="לא נמצאו אנשי קשר שמתאימים לחיפוש." />
        ) : (
          rows.map((c) => <ContactRow key={c.id} c={c} />)
        )}
        {!loading && !error && remaining > 0 && (
          <div className="mg-panel-foot">
            <button className="mg-link-act" type="button" onClick={loadMore} disabled={more === "busy"}>
              הצגת {Math.min(PAGE, remaining)} הבאים
            </button>
            {more === "failed" && (
              <span className="mg-stale" role="alert">
                {" "}
                הטעינה נכשלה. נסו שוב.
              </span>
            )}
          </div>
        )}
      </section>

      <EditContactModal
        isOpen={adding}
        onClose={() => setAdding(false)}
        onSave={async (data) => afterSave(await saver.current.save(data))}
      />
    </>
  );
}

function ContactRow({ c }: { c: MgContactRow }) {
  const phone = displayPhone(c.phone_e164);
  const tel = telHref(c.phone_e164);
  return (
    <div className="mg-trow">
      <p className="mg-c-name">
        <Link to={`/m/people/${c.id}`}>{c.full_name || "ללא שם"}</Link>
      </p>
      <p className="mg-c-sub">
        {phone ? <bdi className="mg-ltr">{phone}</bdi> : <span className="mg-plain">אין טלפון</span>}
      </p>
      <p className={c.classification ? "mg-c-sub" : "mg-c-sub mg-wide-only"}>
        {classificationLabel(c.classification) || <span className="mg-plain">—</span>}
      </p>
      <p className="mg-c-sub" title={c.last_call_date ? fullDate(c.last_call_date) : undefined}>
        <span className="mg-lbl">קשר אחרון: </span>
        {c.last_call_date ? relDay(c.last_call_date) : "אין עדיין"}
      </p>
      <p className={c.assigned_to ? "mg-c-sub" : "mg-c-sub mg-plain"}>
        <span className="mg-lbl">אחראי/ת: </span>
        {c.assigned_to || "אין"}
      </p>
      <p className="mg-c-acts">
        {tel && (
          <a className="mg-btn" href={tel}>
            חיוג
          </a>
        )}
      </p>
    </div>
  );
}
