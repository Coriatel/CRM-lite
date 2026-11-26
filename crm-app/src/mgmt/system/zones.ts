// The five areas of the atlas (approved mockup v4d): which domains sit in which area. Shared by the map and the list's area filter.
export const ZONES = [
  { id: "learn", t: "למידה ותוכן", s: "מההקלטה ועד הלומד", gs: ["lessons-transcription", "lesson-summaries", "itaruta-library", "nekuda", "itra", "video"], c: 1, r: 1, hue: "#0e6f86" },
  { id: "reach", t: "קשר והפצה", s: "אנשי קשר, תורמים, הודעות ואתרים", gs: ["crm", "distribution", "whatsapp", "public-sites"], c: 2, r: 1, hue: "#2f55b5" },
  { id: "agents", t: "סוכנים ואוטומציה", s: "נשמה AI, אוטומציות וסוכני העבודה", gs: ["nai", "automation", "mnos-agents", "learning"], c: 1, r: 2, hue: "#6b46b0" },
  { id: "admin", t: "ניהול וכספים", s: "כספים, מסכי ניהול ודיווחים אליך", gs: ["finance", "cockpit", "flow-apps", "owner-reports"], c: 2, r: 2, hue: "#9b3a72" },
  { id: "base", t: "תשתיות ותפעול", s: "השרת, הרשת, גיבויים, ניטור, והשירותים בחוץ. כל השאר רץ על זה.", gs: ["infra", "backups", "monitoring", "deploy-ci"], c: 0, r: 3, hue: "#4b5d6e", base: 1 },
];
export type Zone = (typeof ZONES)[number];
export const ZN: Record<string, Zone> = Object.fromEntries(ZONES.map((z) => [z.id, z]));
export const ZG: Record<string, string> = Object.fromEntries(ZONES.flatMap((z) => z.gs.map((g) => [g, z.id])));
