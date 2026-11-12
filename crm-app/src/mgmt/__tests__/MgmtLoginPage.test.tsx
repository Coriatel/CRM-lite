import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const signInWithEmail = vi.fn(async () => {});
const requestPasswordReset = vi.fn(async () => {});
vi.mock("../../config", () => ({ AUTH_MODE: "oauth" }));
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ signInWithEmail, signInWithGoogle: vi.fn(), error: null }),
}));
vi.mock("../../services/auth", () => ({
  getEnabledAuthProviders: async () => [],
  requestPasswordReset: (e: string) => requestPasswordReset(e),
}));

import { MgmtLoginPage } from "../MgmtLoginPage";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("MgmtLoginPage", () => {
  it("signs in with the typed email and password", async () => {
    render(<MgmtLoginPage />);
    fireEvent.change(screen.getByLabelText("אימייל"), { target: { value: "a@example.org" } });
    fireEvent.change(screen.getByLabelText("סיסמה"), { target: { value: "pw" } });
    fireEvent.click(screen.getByRole("button", { name: "כניסה" }));
    await waitFor(() => expect(signInWithEmail).toHaveBeenCalledWith("a@example.org", "pw"));
  });

  it("shows no Google button or notice when Google sign-in is not enabled", async () => {
    render(<MgmtLoginPage />);
    await waitFor(() => expect(screen.queryByText(/Google/)).toBeNull());
  });

  it("password reset ends on the same message whatever the address", async () => {
    render(<MgmtLoginPage />);
    fireEvent.click(screen.getByRole("button", { name: "שכחתי סיסמה" }));
    fireEvent.change(screen.getByLabelText("אימייל"), { target: { value: "nobody@example.org" } });
    fireEvent.click(screen.getByRole("button", { name: "שליחת קישור לאיפוס" }));
    await waitFor(() => expect(screen.getByText(/אם קיים חשבון/)).toBeTruthy());
    expect(requestPasswordReset).toHaveBeenCalledWith("nobody@example.org");
  });
});
