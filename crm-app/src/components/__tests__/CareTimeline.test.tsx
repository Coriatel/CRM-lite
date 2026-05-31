import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { DirectusCareReport } from "../../services/directus";

const getCareReports = vi.fn();
vi.mock("../../services/directus", () => ({
  getCareReports: (...a: unknown[]) => getCareReports(...a),
}));
// CareReportForm is rendered only on demand; stub it so the timeline test stays isolated.
vi.mock("../care/CareReportForm", () => ({
  CareReportForm: () => null,
}));

import { CareTimeline } from "../care/CareTimeline";

function report(over: Partial<DirectusCareReport> = {}): DirectusCareReport {
  return {
    id: "r1",
    contact_id: "c1",
    interaction_type: "meeting",
    interaction_at: "2026-05-31T10:00:00.000Z",
    summary: "ביקור בית",
    followup_status: "none",
    ...over,
  };
}

beforeEach(() => getCareReports.mockReset());

describe("CareTimeline", () => {
  it("shows empty state when there are no reports", async () => {
    getCareReports.mockResolvedValue([]);
    render(<CareTimeline contactId="c1" contactName="דני" />);
    await waitFor(() =>
      expect(screen.getByText("אין דיווחי טיפול עדיין")).toBeTruthy(),
    );
  });

  it("renders a report's summary and type", async () => {
    getCareReports.mockResolvedValue([report({ summary: "שיחה חשובה" })]);
    render(<CareTimeline contactId="c1" contactName="דני" />);
    await waitFor(() => expect(screen.getByText("שיחה חשובה")).toBeTruthy());
    expect(screen.getByText(/פגישה/)).toBeTruthy();
  });

  it("shows a pending follow-up marker with its due date", async () => {
    getCareReports.mockResolvedValue([
      report({ followup_status: "pending", followup_due: "2026-06-07" }),
    ]);
    render(<CareTimeline contactId="c1" contactName="דני" />);
    await waitFor(() => expect(screen.getByText(/2026-06-07/)).toBeTruthy());
  });
});
