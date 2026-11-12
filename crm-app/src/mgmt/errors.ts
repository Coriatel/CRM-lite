// directusFetch throws Error("Server error (<status>)") or Error("Token expired")
// with no status field, so the status is read back from the message.
export function httpStatusOf(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : "";
  if (msg === "Token expired") return 401;
  const m = /\((\d{3})\)/.exec(msg);
  return m ? Number(m[1]) : null;
}

export function isForbidden(err: unknown): boolean {
  return httpStatusOf(err) === 403;
}
