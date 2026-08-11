import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getStoredTokens } from "../services/auth";
import {
  bodyLine,
  sectionBox,
  sectionHead,
  subLine,
} from "./workflow-page-styles";

// Owner-only secrets registry — METADATA ONLY.
//
// This page reads /api/secrets, an owner-authenticated backend endpoint. It
// does NOT read /ops-data/*: that is a Caddy static route with no
// authentication, served publicly on two domains, and the independent review
// showed that publishing a projection there put the entire credential
// inventory on the open internet. There is no static projection any more.
//
// The raw value is accepted exactly once, in the create or replace form, and
// is never returned by the API, never stored in component state after submit,
// and never rendered. The backend derives the owner and the storage location
// from the authenticated session — neither is sent by the browser.

type LoadState = "loading" | "ready" | "empty" | "error" | "unauthorised";

export type SecretStatus = "active" | "disabled" | "expired";

export type SecretMeta = {
  name: string;
  type: string;
  purpose: string;
  consumer: string;
  owner: string;
  created: string;
  updated: string;
  expiry: string | null;
  status: SecretStatus;
};

export const SECRET_TYPES = ["password", "token", "api_key", "connection_string", "other"];

// Defence in depth against a mis-built response: even if an upstream bug ever
// put a value-bearing key into the JSON, the UI drops it here and renders only
// the metadata allowlist. The browser must never hold a secret.
export function sanitizeSecret(raw: Record<string, unknown>): SecretMeta {
  return {
    name: String(raw.name ?? ""),
    type: String(raw.type ?? "other"),
    purpose: String(raw.purpose ?? ""),
    consumer: String(raw.consumer ?? ""),
    owner: String(raw.owner ?? ""),
    created: String(raw.created ?? ""),
    updated: String(raw.updated ?? raw.created ?? ""),
    expiry: raw.expiry == null ? null : String(raw.expiry),
    status: (["active", "disabled", "expired"].includes(String(raw.status))
      ? String(raw.status)
      : "active") as SecretStatus,
  };
}

export function statusLabel(status: SecretStatus): string {
  if (status === "disabled") return "מושבת";
  if (status === "expired") return "פג תוקף";
  return "פעיל";
}

export function statusColor(status: SecretStatus): string {
  if (status === "disabled") return "#6b7280";
  if (status === "expired") return "#b45309";
  return "#15803d";
}

function authHeaders(): Record<string, string> {
  const { accessToken } = getStoredTokens();
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; unauthorised: boolean; error: string };

async function callApi<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      ...init,
      cache: "no-store",
      // Authority comes from the Authorization header only; never send cookies.
      credentials: "omit",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
        ...(init.headers ?? {}),
      },
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, unauthorised: true, error: "אין הרשאה" };
    }
    const json = (await res.json().catch(() => null)) as
      | (T & { error?: string })
      | null;
    if (!res.ok) {
      return { ok: false, unauthorised: false, error: json?.error ?? "הפעולה נכשלה" };
    }
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, unauthorised: false, error: "לא ניתן ליצור קשר עם השרת" };
  }
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  marginTop: 4,
  fontSize: 14,
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  fontFamily: "inherit",
};

const buttonStyle: React.CSSProperties = {
  padding: "8px 14px",
  fontSize: 14,
  borderRadius: 6,
  border: "1px solid #2563eb",
  background: "#2563eb",
  color: "#fff",
  cursor: "pointer",
  fontFamily: "inherit",
};

const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, marginBottom: 8 };

export function OpsSecretsPage() {
  const [secrets, setSecrets] = useState<SecretMeta[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Create form
  const [name, setName] = useState("");
  const [type, setType] = useState("token");
  const [purpose, setPurpose] = useState("");
  const [consumer, setConsumer] = useState("");
  const [expiry, setExpiry] = useState("");
  const [value, setValue] = useState("");

  // Replace form
  const [replaceName, setReplaceName] = useState<string | null>(null);
  const [replaceValue, setReplaceValue] = useState("");

  const load = useCallback(async () => {
    const res = await callApi<{ secrets: Record<string, unknown>[] }>("/api/secrets");
    if (!res.ok) {
      setState(res.unauthorised ? "unauthorised" : "error");
      return;
    }
    const list = (res.data.secrets ?? []).map(sanitizeSecret);
    setSecrets(list);
    setState(list.length === 0 ? "empty" : "ready");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await callApi<{ secret: Record<string, unknown> }>("/api/secrets", {
      method: "POST",
      body: JSON.stringify({
        name,
        type,
        purpose,
        consumer,
        expiry: expiry || null,
        value,
      }),
    });
    // Drop the raw value from component state immediately, whatever happened.
    setValue("");
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setName("");
    setPurpose("");
    setConsumer("");
    setExpiry("");
    setNotice("הסוד נשמר. הערך לא יוצג שוב.");
    await load();
  }

  async function onReplace(e: React.FormEvent) {
    e.preventDefault();
    if (!replaceName) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await callApi<{ secret: Record<string, unknown> }>(
      `/api/secrets/${encodeURIComponent(replaceName)}`,
      { method: "PUT", body: JSON.stringify({ value: replaceValue }) },
    );
    setReplaceValue("");
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setReplaceName(null);
    setNotice("הערך הוחלף. הערך החדש לא יוצג.");
    await load();
  }

  async function onDisable(secretName: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await callApi<{ secret: Record<string, unknown> }>(
      `/api/secrets/${encodeURIComponent(secretName)}/disable`,
      { method: "POST", body: JSON.stringify({}) },
    );
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setNotice("הסוד הושבת. ההשבתה אינה מבטלת את האישור אצל הספק.");
    await load();
  }

  return (
    <main
      dir="rtl"
      lang="he"
      data-testid="ops-secrets-page"
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "12px 14px 32px",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <nav style={{ marginBottom: 12 }}>
        <Link
          to="/ops"
          data-testid="ops-secrets-back"
          style={{ fontSize: 13, color: "#2563eb", textDecoration: "none" }}
        >
          ← חזרה לתפעול
        </Link>
      </nav>

      <h1 style={{ fontSize: 18, margin: "0 0 4px 0" }}>סודות — מרשם</h1>
      <p style={subLine}>
        מטא-דאטה בלבד. ערכי הסודות נשמרים בקבצים פרטיים בהרשאת בעלים בלבד, נמסרים
        פעם אחת בלבד בעת השמירה, ואינם מוחזרים מה-API ואינם מוצגים בדף הזה.
      </p>

      {state === "loading" && (
        <div data-testid="ops-secrets-loading" style={bodyLine}>
          טוען מרשם סודות…
        </div>
      )}

      {state === "unauthorised" && (
        <div data-testid="ops-secrets-unauthorised" role="alert" style={sectionBox}>
          <h2 style={sectionHead}>אין הרשאה</h2>
          <p style={bodyLine}>
            המרשם זמין לבעלים המאומת בלבד. התחבר מחדש ונסה שוב.
          </p>
        </div>
      )}

      {state === "error" && (
        <div data-testid="ops-secrets-error" role="alert" style={bodyLine}>
          לא ניתן לטעון את מרשם הסודות. נסה לרענן את הדף.
        </div>
      )}

      {notice && (
        <div data-testid="ops-secrets-notice" role="status" style={{ ...bodyLine, color: "#15803d" }}>
          {notice}
        </div>
      )}
      {error && (
        <div data-testid="ops-secrets-action-error" role="alert" style={{ ...bodyLine, color: "#b91c1c" }}>
          {error}
        </div>
      )}

      {state === "empty" && (
        <div data-testid="ops-secrets-empty" role="status" style={sectionBox}>
          <h2 style={sectionHead}>אין סודות רשומים עדיין</h2>
          <p style={bodyLine}>הוסף את הסוד הראשון בטופס שלמטה.</p>
        </div>
      )}

      {state === "ready" && (
        <section data-testid="ops-secrets-list" style={sectionBox}>
          <h2 style={sectionHead}>סודות רשומים ({secrets.length})</h2>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {secrets.map((s) => (
              <li
                key={s.name}
                data-testid="ops-secret-row"
                style={{ padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                  <strong style={{ fontSize: 14 }}>{s.name}</strong>
                  <span
                    data-testid="ops-secret-status"
                    style={{ fontSize: 12, color: statusColor(s.status) }}
                  >
                    {statusLabel(s.status)}
                  </span>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>{s.type}</span>
                </div>
                <div style={subLine}>{s.purpose}</div>
                <div style={subLine}>
                  צרכן: {s.consumer} · בעלים: {s.owner} · נוצר: {s.created} · עודכן:{" "}
                  {s.updated ? s.updated.slice(0, 10) : "—"} · תפוגה: {s.expiry ?? "ללא"}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <button
                    type="button"
                    data-testid={`ops-secret-replace-${s.name}`}
                    onClick={() => {
                      setReplaceName(s.name);
                      setReplaceValue("");
                    }}
                    disabled={busy}
                    style={{ ...buttonStyle, background: "#fff", color: "#2563eb" }}
                  >
                    החלפת ערך
                  </button>
                  <button
                    type="button"
                    data-testid={`ops-secret-disable-${s.name}`}
                    onClick={() => void onDisable(s.name)}
                    disabled={busy || s.status === "disabled"}
                    style={{ ...buttonStyle, background: "#fff", color: "#6b7280", borderColor: "#cbd5e1" }}
                  >
                    השבתה
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {replaceName && (
        <section data-testid="ops-secrets-replace-form" style={sectionBox}>
          <h2 style={sectionHead}>החלפת ערך — {replaceName}</h2>
          <form onSubmit={onReplace}>
            <label style={labelStyle}>
              ערך חדש
              <input
                data-testid="ops-secret-replace-value"
                type="password"
                autoComplete="new-password"
                value={replaceValue}
                onChange={(e) => setReplaceValue(e.target.value)}
                required
                style={inputStyle}
              />
            </label>
            <p style={subLine}>הערך נמסר פעם אחת ולא יוצג שוב.</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" data-testid="ops-secret-replace-submit" disabled={busy} style={buttonStyle}>
                שמירה
              </button>
              <button
                type="button"
                onClick={() => {
                  setReplaceName(null);
                  setReplaceValue("");
                }}
                style={{ ...buttonStyle, background: "#fff", color: "#6b7280", borderColor: "#cbd5e1" }}
              >
                ביטול
              </button>
            </div>
          </form>
        </section>
      )}

      {state !== "unauthorised" && state !== "loading" && (
        <section data-testid="ops-secrets-create-form" style={sectionBox}>
          <h2 style={sectionHead}>הוספת סוד</h2>
          <form onSubmit={onCreate}>
            <label style={labelStyle}>
              שם
              <input
                data-testid="ops-secret-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              סוג
              <select
                data-testid="ops-secret-type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                style={inputStyle}
              >
                {SECRET_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label style={labelStyle}>
              מטרה
              <input
                data-testid="ops-secret-purpose"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                required
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              צרכן
              <input
                data-testid="ops-secret-consumer"
                value={consumer}
                onChange={(e) => setConsumer(e.target.value)}
                required
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              תפוגה (YYYY-MM-DD, אופציונלי)
              <input
                data-testid="ops-secret-expiry"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              ערך
              <input
                data-testid="ops-secret-value"
                type="password"
                autoComplete="new-password"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
                style={inputStyle}
              />
            </label>
            <p style={subLine}>
              הערך נשלח פעם אחת, נשמר בקובץ פרטי בשרת, ולא יוחזר ולא יוצג לאחר מכן.
              הבעלים ומיקום האחסון נגזרים בשרת.
            </p>
            <button type="submit" data-testid="ops-secret-create-submit" disabled={busy} style={buttonStyle}>
              שמירה
            </button>
          </form>
        </section>
      )}
    </main>
  );
}
