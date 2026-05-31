import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const createMeeting = vi.fn();
const createReminder = vi.fn();
const updateMeeting = vi.fn();
const updateReminder = vi.fn();
vi.mock("../../services/directus", () => ({
  createMeeting: (...a: unknown[]) => createMeeting(...a),
  createReminder: (...a: unknown[]) => createReminder(...a),
  updateMeeting: (...a: unknown[]) => updateMeeting(...a),
  updateReminder: (...a: unknown[]) => updateReminder(...a),
}));
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uid: "u1", email: "r@x", displayName: "Rav" } }),
}));

import { MeetingForm } from "../schedule/MeetingForm";
import { ReminderForm } from "../schedule/ReminderForm";
import type {
  DirectusMeeting,
  DirectusReminder,
} from "../../services/directus";

const fullMeeting: DirectusMeeting = {
  id: "m9",
  title: "פגישה קיימת",
  starts_at: "2026-06-01T11:00:00.000Z",
  ends_at: "2026-06-01T12:30:00.000Z",
  location: "המשרד הראשי",
  status: "scheduled",
  contact_id: "c1",
  owner_id: "u1",
};
const fullReminder: DirectusReminder = {
  id: "r9",
  title: "תזכורת קיימת",
  due_at: "2026-06-02T09:00:00.000Z",
  status: "pending",
  contact_id: "c2",
  owner_id: "u1",
};

beforeEach(() => {
  createMeeting.mockReset();
  createReminder.mockReset();
  updateMeeting.mockReset().mockResolvedValue({ id: "x" });
  updateReminder.mockReset().mockResolvedValue({ id: "x" });
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

describe("MeetingForm edit mode (A7 Phase 1)", () => {
  it("prefills from the full row and shows edit affordances", () => {
    render(<MeetingForm onClose={() => {}} editing={fullMeeting} />);
    expect(screen.getByText("עריכת פגישה")).toBeTruthy();
    expect((screen.getByPlaceholderText("עם מי / על מה") as HTMLInputElement).value).toBe("פגישה קיימת");
    expect(screen.getByText("עדכון")).toBeTruthy();
  });

  it("edits via updateMeeting WITHOUT null-overwriting location/ends_at, and without touching notes", async () => {
    const onClose = vi.fn();
    render(<MeetingForm onClose={onClose} editing={fullMeeting} onCreated={() => {}} />);
    // change only the title; leave location/ends_at/notes untouched
    fireEvent.change(screen.getByPlaceholderText("עם מי / על מה"), {
      target: { value: "פגישה מעודכנת" },
    });
    fireEvent.click(screen.getByText("עדכון"));
    await waitFor(() => expect(updateMeeting).toHaveBeenCalledTimes(1));
    const [id, patch] = updateMeeting.mock.calls[0];
    expect(id).toBe("m9");
    expect(patch.title).toBe("פגישה מעודכנת");
    // preserved from the prefilled full row — NOT nulled
    expect(patch.location).toBe("המשרד הראשי");
    expect(patch.ends_at).toBe("2026-06-01T12:30:00.000Z");
    // notes left blank in edit mode → key absent → existing note preserved
    expect("notes" in patch).toBe(false);
    expect(createMeeting).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("only writes notes when the rabbi types a new one", async () => {
    render(<MeetingForm onClose={() => {}} editing={fullMeeting} />);
    const ta = document.querySelector("textarea")!;
    fireEvent.change(ta, { target: { value: "הערה חדשה" } });
    fireEvent.click(screen.getByText("עדכון"));
    await waitFor(() => expect(updateMeeting).toHaveBeenCalledTimes(1));
    expect(updateMeeting.mock.calls[0][1].notes).toBe("הערה חדשה");
  });
});

describe("ReminderForm edit mode (A7 Phase 1)", () => {
  it("prefills and edits via updateReminder without touching notes", async () => {
    render(<ReminderForm onClose={() => {}} editing={fullReminder} />);
    expect(screen.getByText("עריכת תזכורת")).toBeTruthy();
    expect((screen.getByPlaceholderText("מה לזכור") as HTMLInputElement).value).toBe("תזכורת קיימת");
    fireEvent.change(screen.getByPlaceholderText("מה לזכור"), {
      target: { value: "תזכורת מעודכנת" },
    });
    fireEvent.click(screen.getByText("עדכון"));
    await waitFor(() => expect(updateReminder).toHaveBeenCalledTimes(1));
    const [id, patch] = updateReminder.mock.calls[0];
    expect(id).toBe("r9");
    expect(patch.title).toBe("תזכורת מעודכנת");
    expect("notes" in patch).toBe(false);
    expect(createReminder).not.toHaveBeenCalled();
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
