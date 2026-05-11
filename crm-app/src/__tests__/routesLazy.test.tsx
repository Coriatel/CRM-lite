import { describe, it, expect } from "vitest";

// Contract test for PR #16 route code-splitting.
//
// App.tsx loads each authenticated page via React.lazy + a named-export
// shim: `import(...).then(m => ({ default: m.X }))`. A typo in the
// re-export name compiles cleanly but blows up at runtime on first
// navigation. This test mirrors the exact import shape so a rename
// or removal fails CI instead of production.

type LazyImporter = () => Promise<{ default: unknown }>;

const lazyImports: Array<[string, LazyImporter]> = [
  [
    "ContactsPage",
    () =>
      import("../pages/ContactsPage").then((m) => ({ default: m.ContactsPage })),
  ],
  [
    "DashboardPage",
    () =>
      import("../pages/DashboardPage").then((m) => ({
        default: m.DashboardPage,
      })),
  ],
  [
    "SettingsPage",
    () =>
      import("../pages/SettingsPage").then((m) => ({ default: m.SettingsPage })),
  ],
  [
    "ActiveCallPage",
    () =>
      import("../pages/ActiveCallPage").then((m) => ({
        default: m.ActiveCallPage,
      })),
  ],
  [
    "ImportPage",
    () =>
      import("../pages/ImportPage").then((m) => ({ default: m.ImportPage })),
  ],
  [
    "PeopleHubPage",
    () =>
      import("../pages/PeopleHubPage").then((m) => ({
        default: m.PeopleHubPage,
      })),
  ],
  [
    "TodayPage",
    () => import("../pages/TodayPage").then((m) => ({ default: m.TodayPage })),
  ],
  [
    "CallsTodayPage",
    () =>
      import("../pages/CallsTodayPage").then((m) => ({
        default: m.CallsTodayPage,
      })),
  ],
];

describe("App route code-splitting", () => {
  it.each(lazyImports)(
    "%s lazy import resolves to a component default export",
    async (_name, importer) => {
      const mod = await importer();
      expect(mod.default).toBeDefined();
      expect(typeof mod.default).toBe("function");
    },
  );
});
