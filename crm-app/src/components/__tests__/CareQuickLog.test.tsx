import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const createCareReport = vi.fn();
vi.mock("../../services/directus", () => ({
  createCareReport: (...a: unknown[]) => createCareReport(...a),
}));

import { CareQuickLog } from "../care/CareQuickLog";

describe("CareQuickLog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires a summary before saving", () => {
    render(<CareQuickLog contactId="c1" />);
    fireEvent.click(screen.getByTestId("care-quick-save"));
    expect(screen.getByTestId("care-quick-error").textContent).toContain("סיכום");
    expect(createCareReport).not.toHaveBeenCalled();
  });

  it("creates a care report with the chosen type, summary, and now, then calls onSaved", async () => {
    createCareReport.mockResolvedValue({});
    const onSaved = vi.fn();
    render(<CareQuickLog contactId="c1" onSaved={onSaved} />);
    fireEvent.click(screen.getByTestId("care-quick-type-meeting"));
    fireEvent.change(screen.getByTestId("care-quick-summary"), { target: { value: "ביקור בית" } });
    fireEvent.click(screen.getByTestId("care-quick-save"));
    await waitFor(() => expect(createCareReport).toHaveBeenCalledTimes(1));
    const arg = createCareReport.mock.calls[0][0];
    expect(arg.contact_id).toBe("c1");
    expect(arg.interaction_type).toBe("meeting");
    expect(arg.summary).toBe("ביקור בית");
    expect(typeof arg.interaction_at).toBe("string");
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it("defaults the interaction type to call", async () => {
    createCareReport.mockResolvedValue({});
    render(<CareQuickLog contactId="c1" />);
    fireEvent.change(screen.getByTestId("care-quick-summary"), { target: { value: "שיחה קצרה" } });
    fireEvent.click(screen.getByTestId("care-quick-save"));
    await waitFor(() =>
      expect(createCareReport.mock.calls[0][0].interaction_type).toBe("call"),
    );
  });

  it("clears the summary after a successful save", async () => {
    createCareReport.mockResolvedValue({});
    render(<CareQuickLog contactId="c1" />);
    const input = screen.getByTestId("care-quick-summary") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "x" } });
    fireEvent.click(screen.getByTestId("care-quick-save"));
    await waitFor(() => expect(input.value).toBe(""));
  });

  it("shows an error when the save fails", async () => {
    createCareReport.mockRejectedValue(new Error("boom"));
    render(<CareQuickLog contactId="c1" />);
    fireEvent.change(screen.getByTestId("care-quick-summary"), { target: { value: "x" } });
    fireEvent.click(screen.getByTestId("care-quick-save"));
    await waitFor(() => expect(screen.getByTestId("care-quick-error").textContent).toContain("נכשל"));
  });
});
