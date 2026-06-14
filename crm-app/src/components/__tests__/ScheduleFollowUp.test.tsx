import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const updateContact = vi.fn();
vi.mock("../../services/directus", () => ({
  updateContact: (...a: unknown[]) => updateContact(...a),
}));

import { ScheduleFollowUp } from "../people/ScheduleFollowUp";

describe("ScheduleFollowUp", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the current follow-up date when one is set", () => {
    render(<ScheduleFollowUp contactId="c1" currentDate="2026-06-10" />);
    expect(screen.getByTestId("schedule-followup-current").textContent).toContain("2026-06-10");
  });

  it("requires a date before saving", async () => {
    render(<ScheduleFollowUp contactId="c1" />);
    fireEvent.click(screen.getByTestId("schedule-followup-save"));
    expect(screen.getByTestId("schedule-followup-error").textContent).toContain("תאריך");
    expect(updateContact).not.toHaveBeenCalled();
  });

  it("patches follow_up_date (and note when typed) via updateContact", async () => {
    updateContact.mockResolvedValue({});
    const onChanged = vi.fn();
    render(<ScheduleFollowUp contactId="c1" onChanged={onChanged} />);
    fireEvent.change(screen.getByTestId("schedule-followup-date"), { target: { value: "2026-06-15" } });
    fireEvent.change(screen.getByTestId("schedule-followup-note"), { target: { value: "להחזיר טלפון" } });
    fireEvent.click(screen.getByTestId("schedule-followup-save"));
    await waitFor(() =>
      expect(updateContact).toHaveBeenCalledWith("c1", {
        follow_up_date: "2026-06-15",
        follow_up_note: "להחזיר טלפון",
      }),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith("2026-06-15", "להחזיר טלפון"));
  });

  it("omits follow_up_note from the PATCH when left blank (never blanks an existing note)", async () => {
    updateContact.mockResolvedValue({});
    render(<ScheduleFollowUp contactId="c1" />);
    fireEvent.change(screen.getByTestId("schedule-followup-date"), { target: { value: "2026-07-01" } });
    fireEvent.click(screen.getByTestId("schedule-followup-save"));
    await waitFor(() =>
      expect(updateContact).toHaveBeenCalledWith("c1", { follow_up_date: "2026-07-01" }),
    );
  });

  it("shows an error when the save fails", async () => {
    updateContact.mockRejectedValue(new Error("boom"));
    render(<ScheduleFollowUp contactId="c1" />);
    fireEvent.change(screen.getByTestId("schedule-followup-date"), { target: { value: "2026-07-01" } });
    fireEvent.click(screen.getByTestId("schedule-followup-save"));
    await waitFor(() => expect(screen.getByTestId("schedule-followup-error").textContent).toContain("נכשל"));
  });
});
