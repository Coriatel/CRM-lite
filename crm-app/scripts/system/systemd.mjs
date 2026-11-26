// system-panel-api server. Loopback only: Caddy (nihul only) forwards /api/system/* here.
//   SYSTEM_PANEL_OWNER_EMAILS  comma-separated allowlist; REQUIRED, no default
//   SYSTEM_PANEL_DATA_DIR      default /data/services/system-map (reads <dir>/current/*)
//   SYSTEM_PANEL_PORT          default 8794
//   VITE_DIRECTUS_URL / DIRECTUS_URL  identity provider
import { createServer } from "node:http";
import { createHandler } from "./systemapi.mjs";

const ownerEmails = String(process.env.SYSTEM_PANEL_OWNER_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const directusUrl = String(process.env.VITE_DIRECTUS_URL || process.env.DIRECTUS_URL || "").replace(/\/+$/, "");
if (!ownerEmails.length || !directusUrl) {
  console.error("error: SYSTEM_PANEL_OWNER_EMAILS and DIRECTUS_URL are required");
  process.exit(2);
}
const port = Number(process.env.SYSTEM_PANEL_PORT || 8794);
const handle = createHandler({ dataDir: process.env.SYSTEM_PANEL_DATA_DIR || "/data/services/system-map", directusUrl, ownerEmails });
createServer(handle).listen(port, "127.0.0.1", () => console.log(`system-panel-api on 127.0.0.1:${port}`));
