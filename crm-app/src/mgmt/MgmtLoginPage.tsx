import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { AUTH_MODE } from "../config";
import { getEnabledAuthProviders, requestPasswordReset } from "../services/auth";
import "./mgmt.css";

// The sign-in screen of the management area. Same auth calls as the existing LoginPage;
// only the look differs, so a person arriving at /m sees one design from the first screen.
export function MgmtLoginPage() {
  const { signInWithGoogle, signInWithEmail, error } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"signin" | "reset" | "sent">("signin");
  const [google, setGoogle] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getEnabledAuthProviders()
      .catch(() => [] as string[])
      .then((p) => {
        if (!cancelled) setGoogle(p.includes("google"));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || busy) return;
    setBusy(true);
    try {
      await signInWithEmail(email, password);
    } finally {
      setBusy(false);
      setPassword("");
    }
  };

  // One outcome whatever the address is, so this screen never reveals which accounts exist.
  const reset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || busy) return;
    setBusy(true);
    try {
      await requestPasswordReset(email);
    } catch {
      // same outcome on purpose
    } finally {
      setBusy(false);
      setMode("sent");
    }
  };

  if (AUTH_MODE !== "oauth") return <div className="mg mg-login" aria-busy="true" />;

  return (
    <div className="mg mg-login">
      <main className="mg-login-card">
        <img className="mg-login-mark" src="/mgmt/client-mark.png" alt="מרכז נשמה" />
        <h1>מרחב הניהול</h1>

        {error && mode === "signin" && (
          <p className="mg-login-err" role="alert">
            {error}
          </p>
        )}

        {mode === "sent" ? (
          <>
            <p className="mg-login-text">
              אם קיים חשבון עבור הכתובת הזאת, נשלח אליה קישור לאיפוס סיסמה. הקישור תקף לזמן קצר
              ולשימוש אחד.
            </p>
            <button className="mg-btn mg-btn-cta" type="button" onClick={() => setMode("signin")}>
              חזרה לכניסה
            </button>
          </>
        ) : (
          <form onSubmit={mode === "signin" ? signIn : reset}>
            <div className="mg-field">
              <label htmlFor="mg-login-email">אימייל</label>
              <input
                id="mg-login-email"
                className="mg-ltr"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            {mode === "signin" && (
              <div className="mg-field">
                <label htmlFor="mg-login-pw">סיסמה</label>
                <input
                  id="mg-login-pw"
                  className="mg-ltr"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            )}
            <button className="mg-btn mg-btn-cta" type="submit" disabled={busy}>
              {mode === "signin" ? (busy ? "נכנס…" : "כניסה") : busy ? "שולח…" : "שליחת קישור לאיפוס"}
            </button>
            <button
              className="mg-link-act"
              type="button"
              onClick={() => setMode(mode === "signin" ? "reset" : "signin")}
            >
              {mode === "signin" ? "שכחתי סיסמה" : "חזרה לכניסה"}
            </button>
          </form>
        )}

        {google && mode === "signin" && (
          <button className="mg-btn mg-btn-quiet" type="button" onClick={signInWithGoogle}>
            כניסה עם Google
          </button>
        )}
      </main>
    </div>
  );
}
