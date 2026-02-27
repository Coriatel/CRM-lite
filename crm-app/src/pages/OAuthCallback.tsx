import { useEffect, useState } from "react";
import { parseOAuthCallback, storeTokens } from "../services/auth";

export function OAuthCallback() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash;

    if (!hash) {
      setError("לא התקבלו נתוני אימות");
      return;
    }

    // Clear hash immediately to prevent token leakage via history/referer
    window.history.replaceState(null, "", window.location.pathname);

    const tokens = parseOAuthCallback(hash);

    if (!tokens) {
      setError("שגיאה בקריאת טוקן האימות");
      return;
    }

    // Store tokens and redirect to home
    storeTokens(tokens.accessToken, tokens.refreshToken, tokens.expires);
    window.location.replace("/");
  }, []);

  if (error) {
    return (
      <div className="login-page">
        <div
          style={{
            width: 100,
            height: 100,
            background: "white",
            borderRadius: "20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "var(--spacing-lg)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <span style={{ fontSize: "48px" }}>⚠️</span>
        </div>
        <h1 className="login-title">שגיאת אימות</h1>
        <p className="login-subtitle">{error}</p>
        <button
          className="google-btn"
          style={{ marginTop: "var(--spacing-lg)" }}
          onClick={() => window.location.replace("/")}
        >
          חזור לדף הבית
        </button>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="loading">
        <div
          className="spinner"
          style={{
            borderTopColor: "white",
            borderColor: "rgba(255,255,255,0.3)",
          }}
        ></div>
      </div>
      <p className="login-subtitle">מתחבר...</p>
    </div>
  );
}
