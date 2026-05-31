import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const createCareReport = vi.fn();
vi.mock("../../services/directus", () => ({
  createCareReport: (...a: unknown[]) => createCareReport(...a),
}));

import { CareReportForm } from "../care/CareReportForm";

beforeEach(() => createCareReport.mockReset());

describe("CareReportForm", () => {
  it("blocks submit and shows an error when summary is empty", async () => {
    render(
      <CareReportForm contactId="c1" contactName="דני" onClose={() => {}} />,
    );
    fireEvent.click(screen.getByText("שמירה"));
    await waitFor(() =>
      expect(screen.getByText("נא למלא תיאור הטיפול")).toBeTruthy(),
    );
    expect(createCareReport).not.toHaveBeenCalled();
  });

  it("creates a care report with the contact id and summary, then closes", async () => {
    createCareReport.mockResolvedValue({ id: "new-1" });
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(
      <CareReportForm
        contactId="c1"
        contactName="דני"
        onClose={onClose}
        onSaved={onSaved}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("מה קרה בטיפול"), {
      target: { value: "ביקור בית" },
    });
    fireEvent.click(screen.getByText("שמירה"));
    await waitFor(() => expect(createCareReport).toHaveBeenCalledTimes(1));
    const arg = createCareReport.mock.calls[0][0];
    expect(arg.contact_id).toBe("c1");
    expect(arg.summary).toBe("ביקור בית");
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("renders the pastoral sensitivity hint", () => {
    render(
      <CareReportForm contactId="c1" contactName="דני" onClose={() => {}} />,
    );
    expect(screen.getByText("תוכן רגיש – מידע פסטורלי חסוי")).toBeTruthy();
  });
});
