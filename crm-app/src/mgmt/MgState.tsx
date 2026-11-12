import { isForbidden } from "./errors";

export function MgLoading() {
  return (
    <div style={{ paddingBlock: 12 }} role="status" aria-label="טוען">
      <span className="mg-skel mg-w1" />
      <span className="mg-skel mg-w2" />
    </div>
  );
}

/** One block for the three non-data states, so every screen words them the same. */
export function MgNotice({
  error,
  empty,
  onRetry,
}: {
  error?: unknown;
  empty?: string;
  onRetry?: () => void;
}) {
  if (error && isForbidden(error)) {
    return (
      <div className="mg-empty">
        <p>אין לך הרשאה לראות את המידע הזה. לבקשת הרשאה פונים למנהל/ת המערכת.</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="mg-empty">
        <p>לא הצלחנו לטעון את הנתונים כרגע.</p>
        {onRetry && (
          <button className="mg-btn" type="button" onClick={onRetry}>
            ניסיון נוסף
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="mg-empty">
      <p>{empty}</p>
    </div>
  );
}
