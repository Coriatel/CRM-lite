import { describe, it, expect } from "vitest";
import {
  verdictHe,
  confidenceHe,
  gateKindHe,
  reversibilityHe,
  actionsHe,
  humanizeRationale,
  humanizeLabel,
  humanizeSuggestedAction,
  looksTechnical,
  gateSummaryHe,
  fmtClock,
  fmtAgeDays,
} from "../ownerCopy";

describe("ownerCopy — executive humanization", () => {
  it("translates verdicts and confidence to Hebrew, never raw enum", () => {
    expect(verdictHe("DEGRADED")).toBe("צריך בדיקה");
    expect(verdictHe("OK")).toBe("תקין");
    expect(verdictHe("WEIRD")).toBe("לא ידוע");
    expect(confidenceHe("FACT")).toBe("ודאי");
    expect(confidenceHe("INFERENCE")).toBe("הערכה");
    expect(confidenceHe(undefined)).toBeNull();
  });

  it("maps session_launch (was untranslated) and unknown kinds safely", () => {
    expect(gateKindHe("session_launch")).toBe("אישור הפעלת סשן");
    expect(gateKindHe("product_direction")).toBe("החלטת כיוון");
    expect(gateKindHe("something_new")).toBe("דורש החלטה");
  });

  it("reversibility + action verbs translate or drop", () => {
    expect(reversibilityHe("risky")).toBe("מסוכן");
    expect(actionsHe(["approve", "continue", "bogus_verb"])).toEqual(["לאשר", "להמשיך"]);
  });

  it("strips scoring formulas from rationale, keeps only Hebrew clause", () => {
    const raw = "operational_priority=75 · weight=informational×0.8 · score=60.0 · מובחר מבין 81 פריטים פתוחים";
    const out = humanizeRationale(raw);
    expect(out).not.toMatch(/operational_priority|score=|weight=/);
    expect(out).toContain("מובחר מבין 81 פריטים פתוחים");
  });

  it("collapses shell-command labels into a human noun", () => {
    expect(humanizeLabel("owner runs crm-app/scripts/slice4-schema/apply.py + validate.py")).toBe(
      "להחיל שינוי מאושר במערכת",
    );
    expect(looksTechnical("crm-app/scripts/x.py")).toBe(true);
    expect(looksTechnical("להחיל שינוי")).toBe(false);
  });

  it("humanizes terminal-style suggested_action", () => {
    expect(
      humanizeSuggestedAction("owner: answer_owner_gate(decision=approved) to authorize this paid session launch"),
    ).toBe("לאשר את הבקשה");
    expect(humanizeSuggestedAction("answer_owner_gate(decision=rejected)")).toBe("לדחות את הבקשה");
  });

  it("gateSummaryHe never returns a raw technical id", () => {
    expect(gateSummaryHe("degraded_workflow:wm.distribution.tuesday_class_reminder", "product_direction")).toBe(
      "החלטת כיוון",
    );
    expect(gateSummaryHe("תזכורת שיעור יום שלישי תקועה", "product_direction")).toContain("תזכורת");
  });

  it("formats clock and age in Hebrew", () => {
    expect(fmtClock("2026-06-18T05:38:32Z")).toMatch(/^עודכן ב-\d{2}:\d{2}$/);
    expect(fmtAgeDays(44.2)).toBe("לפני 44 ימים");
    expect(fmtAgeDays(0)).toBe("היום");
    expect(fmtAgeDays(null)).toBeNull();
  });
});
