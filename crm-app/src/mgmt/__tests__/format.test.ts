import { describe, it, expect } from "vitest";
import { classificationLabel, displayPhone, fullDate, relDay, telHref } from "../format";
import { httpStatusOf, isForbidden } from "../errors";

const NOW = new Date(2026, 10, 12, 15, 0); // 12.11.2026 local

describe("mgmt format", () => {
  it("shows a stored phone the way people write it", () => {
    expect(displayPhone("+972501234567")).toBe("050-123-4567");
    expect(displayPhone("031234567")).toBe("031234567");
  });
  it("treats a placeholder phone as no phone", () => {
    expect(displayPhone("_no_phone_abc")).toBe("");
    expect(telHref("_no_phone_abc")).toBe("");
    expect(displayPhone(null)).toBe("");
    expect(telHref("+972501234567")).toBe("tel:+972501234567");
  });
  it("words recent days and falls back to a full date after a year", () => {
    expect(relDay("2026-11-12T01:00:00", NOW)).toBe("היום");
    expect(relDay("2026-11-11T23:00:00", NOW)).toBe("אתמול");
    expect(relDay("2026-11-10T10:00:00", NOW)).toBe("לפני יומיים");
    expect(relDay("2026-11-02T10:00:00", NOW)).toBe("לפני 10 ימים");
    expect(relDay("2026-08-10T10:00:00", NOW)).toBe("לפני 3 חודשים");
    expect(relDay("2025-01-05T10:00:00", NOW)).toBe("5.1.2025");
    expect(relDay(null, NOW)).toBe("");
  });
  it("formats a full date without leading zeros", () => {
    expect(fullDate("2026-09-24T06:41:09")).toBe("24.9.2026");
  });
  it("labels known classifications and passes unknown ones through", () => {
    expect(classificationLabel("donor")).toBe("תורם/ת");
    expect(classificationLabel("lead")).toBe("מתעניין/ת");
    expect(classificationLabel("volunteer")).toBe("volunteer");
    expect(classificationLabel(null)).toBe("");
  });
});

describe("mgmt errors", () => {
  it("reads the HTTP status back from directusFetch errors", () => {
    expect(httpStatusOf(new Error("Server error (403)"))).toBe(403);
    expect(httpStatusOf(new Error("Server error (500)"))).toBe(500);
    expect(httpStatusOf(new Error("Token expired"))).toBe(401);
    expect(httpStatusOf(new Error("boom"))).toBeNull();
    expect(isForbidden(new Error("Server error (403)"))).toBe(true);
    expect(isForbidden(new Error("Server error (500)"))).toBe(false);
  });
});
