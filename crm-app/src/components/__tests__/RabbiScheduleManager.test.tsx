import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type {
  DirectusMeeting,
  DirectusReminder,
} from "../../services/directus";

const useRabbiScheduleItems = vi.fn();
vi.mock("../../data/useRabbiScheduleItems", () => ({
  useRabbiScheduleItems: () => useRabbiScheduleItems(),
}));

const updateMeeting = vi.fn();
const updateReminder = vi.fn();
vi.mock("../../services/directus", () => ({
  updateMeeting: (...a: unknown[]) => updateMeeting(...a),
  updateReminder: (...a: unknown[]) => updateReminder(...a),
  createMeeting: vi.fn(),
  createReminder: vi.fn(),
}));
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uid: "u1", email: "r@x", displayName: "Rav" } }),
}));

import { RabbiScheduleManager } from "../dashboard/RabbiScheduleManager";

function meeting(over: Partial<DirectusMeeting> = {}): DirectusMeeting {
  return {
    id: "m1",
    title: "פגישה עם תורם",
    starts_at: "2026-06-01T11:00:00.000Z",
    ends_at: "2026-06-01T12:00:00.000Z",
    location: "המשרד",
    status: "scheduled",
    contact_id: "c1",
    owner_id: "u1",
    ...over,
  };
}
function reminder(over: Partial<DirectusReminder> = {}): DirectusReminder {
  return {
    id: "r1",
    title: "להתקשר לרב",
    due_at: "2026-06-02T09:00:00.000Z",
    status: "pending",
    contact_id: "c2",
    owner_id: "u1",
    ...over,
  };
}

beforeEach(() => {
  useRabbiScheduleItems.mockReset();
  updateMeeting.mockReset().mockResolvedValue({ id: "x" });
  updateReminder.mockReset().mockResolvedValue({ id: "x" });
});

describe("RabbiScheduleManager", () => {
  it("shows loading state", () => {
    useRabbiScheduleItems.mockReturnValue({
      meetings: null, reminders: null, loading: true, error: null, refresh: () => {},
    });
    render(<RabbiScheduleManager />);
    expect(screen.getByTestId("rabbi-sched-loading")).toBeTruthy();
  });

  it("shows error state", () => {
    useRabbiScheduleItems.mockReturnValue({
      meetings: null, reminders: null, loading: false, error: "שגיאה", refresh: () => {},
    });
    render(<RabbiScheduleManager />);
    expect(screen.getByTestId("rabbi-sched-error").textContent).toContain("שגיאה");
  });

  it("shows empty state when no items", () => {
    useRabbiScheduleItems.mockReturnValue({
      meetings: [], reminders: [], loading: false, error: null, refresh: () => {},
    });
    render(<RabbiScheduleManager />);
    expect(screen.getByTestId("rabbi-sched-empty")).toBeTruthy();
  });

  it("renders full meeting + reminder rows (title, location)", () => {
    useRabbiScheduleItems.mockReturnValue({
      meetings: [meeting()], reminders: [reminder()], loading: false, error: null, refresh: () => {},
    });
    render(<RabbiScheduleManager />);
    expect(screen.getByTestId("rabbi-sched-meeting-row").textContent).toContain("פגישה עם תורם");
    expect(screen.getByTestId("rabbi-sched-meeting-row").textContent).toContain("המשרד");
    expect(screen.getByTestId("rabbi-sched-reminder-row").textContent).toContain("להתקשר לרב");
  });

  it("renders a Hebrew status badge on the meeting row from the row's status", () => {
    useRabbiScheduleItems.mockReturnValue({
      meetings: [meeting({ status: "scheduled" })], reminders: [], loading: false, error: null, refresh: () => {},
    });
    render(<RabbiScheduleManager />);
    const row = screen.getByTestId("rabbi-sched-meeting-row");
    const badge = row.querySelector('[data-testid="rabbi-sched-status-badge"]');
    expect(badge?.textContent).toBe("מתוכנן");
  });

  it("renders a Hebrew status badge on the reminder row from the row's status", () => {
    useRabbiScheduleItems.mockReturnValue({
      meetings: [], reminders: [reminder({ status: "pending" })], loading: false, error: null, refresh: () => {},
    });
    render(<RabbiScheduleManager />);
    const row = screen.getByTestId("rabbi-sched-reminder-row");
    const badge = row.querySelector('[data-testid="rabbi-sched-status-badge"]');
    expect(badge?.textContent).toBe("פתוח");
  });

  it("maps done/cancelled statuses to their Hebrew labels", () => {
    useRabbiScheduleItems.mockReturnValue({
      meetings: [meeting({ id: "m2", status: "done" }), meeting({ id: "m3", status: "cancelled" })],
      reminders: [reminder({ id: "r2", status: "dismissed" })],
      loading: false, error: null, refresh: () => {},
    });
    render(<RabbiScheduleManager />);
    const labels = screen.getAllByTestId("rabbi-sched-status-badge").map((b) => b.textContent);
    expect(labels).toContain("בוצע");
    expect(labels).toContain("בוטל");
  });

  it("never renders pastoral notes (readers omit notes; rows have none)", () => {
    // notes is not even on the row types — assert no leak path by construction
    useRabbiScheduleItems.mockReturnValue({
      meetings: [meeting()], reminders: [reminder()], loading: false, error: null, refresh: () => {},
    });
    render(<RabbiScheduleManager />);
    expect(screen.getByTestId("rabbi-sched-manager").textContent).not.toContain("notes");
  });

  it("marks a meeting done via updateMeeting(status=done) then refreshes", async () => {
    const refresh = vi.fn();
    useRabbiScheduleItems.mockReturnValue({
      meetings: [meeting()], reminders: [], loading: false, error: null, refresh,
    });
    render(<RabbiScheduleManager />);
    fireEvent.click(screen.getByTestId("rabbi-sched-mark-done"));
    await waitFor(() => expect(updateMeeting).toHaveBeenCalledWith("m1", { status: "done" }));
    expect(refresh).toHaveBeenCalled();
  });

  it("marks a reminder done via updateReminder(status=done)", async () => {
    useRabbiScheduleItems.mockReturnValue({
      meetings: [], reminders: [reminder()], loading: false, error: null, refresh: () => {},
    });
    render(<RabbiScheduleManager />);
    fireEvent.click(screen.getByTestId("rabbi-sched-mark-done"));
    await waitFor(() => expect(updateReminder).toHaveBeenCalledWith("r1", { status: "done" }));
  });

  it("opens the meeting edit form prefilled when the row edit button is clicked", () => {
    useRabbiScheduleItems.mockReturnValue({
      meetings: [meeting()], reminders: [], loading: false, error: null, refresh: () => {},
    });
    render(<RabbiScheduleManager />);
    fireEvent.click(screen.getByTestId("rabbi-sched-edit"));
    expect(screen.getByText("עריכת פגישה")).toBeTruthy();
    expect((screen.getByPlaceholderText("עם מי / על מה") as HTMLInputElement).value).toBe("פגישה עם תורם");
  });

  it("surfaces an error when a status update fails", async () => {
    updateMeeting.mockRejectedValueOnce(new Error("boom"));
    useRabbiScheduleItems.mockReturnValue({
      meetings: [meeting()], reminders: [], loading: false, error: null, refresh: () => {},
    });
    render(<RabbiScheduleManager />);
    fireEvent.click(screen.getByTestId("rabbi-sched-mark-done"));
    await waitFor(() => expect(screen.getByTestId("rabbi-sched-action-error")).toBeTruthy());
  });
});
