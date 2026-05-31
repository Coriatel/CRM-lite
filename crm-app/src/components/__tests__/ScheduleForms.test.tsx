import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const createMeeting = vi.fn();
const createReminder = vi.fn();
vi.mock("../../services/directus", () => ({
  createMeeting: (...a: unknown[]) => createMeeting(...a),
  createReminder: (...a: unknown[]) => createReminder(...a),
}));
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uid: "u1", email: "r@x", displayName: "Rav" } }),
}));

import { MeetingForm } from "../schedule/MeetingForm";
import { ReminderForm } from "../schedule/ReminderForm";

beforeEach(() => {
  createMeeting.mockReset();
  createReminder.mockReset();
});

describe("MeetingForm", () => {
  it("blocks submit with an error when title is empty", async () => {
    render(<MeetingForm onClose={() => {}} />);
    fireEvent.click(screen.getByText("שמירה"));
    await waitFor(() => expect(screen.getByText("נא למלא כותרת לפגישה")).toBeTruthy());
    expect(createMeeting).not.toHaveBeenCalled();
  });

  it("creates a meeting with the authenticated owner_id, then closes", async () => {
    createMeeting.mockResolvedValue({ id: "m1" });
    const onClose = vi.fn();
    const onCreated = vi.fn();
    render(<MeetingForm onClose={onClose} onCreated={onCreated} />);
    fireEvent.change(screen.getByPlaceholderText("עם מי / על מה"), {
      target: { value: "פגישה עם משפחה" },
    });
    fireEvent.click(screen.getByText("שמירה"));
    await waitFor(() => expect(createMeeting).toHaveBeenCalledTimes(1));
    const arg = createMeeting.mock.calls[0][0];
    expect(arg.title).toBe("פגישה עם משפחה");
    expect(arg.owner_id).toBe("u1");
    expect(onCreated).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("shows the privacy hint near notes", () => {
    render(<MeetingForm onClose={() => {}} />);
    expect(screen.getByText("הערות פרטיות – לא מוצגות בסדר היום")).toBeTruthy();
  });
});

describe("ReminderForm", () => {
  it("blocks submit with an error when title is empty", async () => {
    render(<ReminderForm onClose={() => {}} />);
    fireEvent.click(screen.getByText("שמירה"));
    await waitFor(() => expect(screen.getByText("נא למלא תיאור לתזכורת")).toBeTruthy());
    expect(createReminder).not.toHaveBeenCalled();
  });

  it("creates a reminder with the authenticated owner_id", async () => {
    createReminder.mockResolvedValue({ id: "r1" });
    render(<ReminderForm onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("מה לזכור"), {
      target: { value: "להכין שיעור" },
    });
    fireEvent.click(screen.getByText("שמירה"));
    await waitFor(() => expect(createReminder).toHaveBeenCalledTimes(1));
    const arg = createReminder.mock.calls[0][0];
    expect(arg.title).toBe("להכין שיעור");
    expect(arg.owner_id).toBe("u1");
  });
});

describe("notes privacy in create forms", () => {
  it("sends notes to Directus but never logs them to the console", async () => {
    const secret = "תוכן רגיש מאוד בהערה";
    createMeeting.mockResolvedValue({ id: "m1" });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<MeetingForm onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("עם מי / על מה"), {
      target: { value: "פגישה" },
    });
    // notes is the only textarea in the form
    const ta = document.querySelector("textarea");
    if (!ta) throw new Error("notes textarea not found");
    fireEvent.change(ta, { target: { value: secret } });
    fireEvent.click(screen.getByText("שמירה"));
    await waitFor(() => expect(createMeeting).toHaveBeenCalledTimes(1));
    // notes ARE allowed in the Directus payload...
    expect(createMeeting.mock.calls[0][0].notes).toBe(secret);
    // ...but must never reach the console.
    const logged = [...logSpy.mock.calls, ...errSpy.mock.calls].flat().join(" ");
    expect(logged).not.toContain(secret);
    logSpy.mockRestore();
    errSpy.mockRestore();
  });
});
