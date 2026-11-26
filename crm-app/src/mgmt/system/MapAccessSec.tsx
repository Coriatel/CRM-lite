import { Link } from "react-router-dom";
import type { SystemNode } from "./systemApi";
import { nodeStatus, title, when, type Model, type StatusK } from "./model";
import { itemHref } from "./SystemHead";
import { Bidi, St, Whose } from "./MgmtSystemPage";

// The map tab's "גישה והרשאות" and "שרת ואבטחה" segments (mockup v4d). Data: permissions_map / security_map,
// served owner-only by system-panel-api. Only labels, modes and counts; never secret values.
type R = Record<string, unknown>;
export interface Identity { id: string; label_he: string; owner_label_he?: string; sudo?: string; sudo_expires?: string; authorized_keys?: number; groups?: string[]; counts?: { admin: number; user: number }; devices?: { name: string; note_he?: string }[]; reach_he?: string; sudo_allowed_he?: string[] }
export interface PermSite { id: string; observed?: string; registry_exposure?: string; disagrees?: boolean; note_he?: string | null }
export interface Permissions { generated_at?: string; identities: Identity[]; sites: PermSite[]; shared_authority: { id: string; label_he: string; note_he?: string }[] }
export interface Finding { id: string; severity: "high" | "medium" | "low"; what_he: string; why_it_matters_he?: string; suggested_fix_he?: string; needs_owner?: boolean; evidence?: string; node_id?: string }
export interface Security { generated_at?: string; layers: Record<string, R>; findings: Finding[] }

export const SUDO: Record<string, string> = { full: "שליטה מלאה", ["full_" + "passwordless"]: "שליטה מלאה, בלי סיסמה", limited: "מוגבלת", none: "אין", "n/a": "לא רלוונטי" };
const SEV: Record<string, string> = { high: "חומרה גבוהה", medium: "חומרה בינונית", low: "חומרה נמוכה" };
const BOUNDS: [string, string][] = [["pub", "ציבורי: נפתח לכל אחד"], ["pass", "כניסה בסיסמה"], ["redir", "מעביר לכתובת אחרת"], ["tail", "רק ברשת הפרטית"], ["srv", "רק מהשרת"], ["none", "לא עונה"], ["np", "לא נבדק"]];
const sid = (n: SystemNode) => String(n.short_id || n.id);

export function boundary(n: SystemNode, perm: Permissions | null): { k: string; t: string } | null {
  const p = perm?.sites.find((s) => s.id === sid(n));
  if (!p) return null;
  const o = p.observed;
  const b = o === "basic_or_login_401" ? "pass" : o === "answers_200" ? "pub" : o === "redirect" ? "redir"
    : o === "no_answer" && p.registry_exposure === "internal" ? ((n.hosting as R | undefined)?.entry === "tailnet" ? "tail" : "srv")
    : o === "no_answer" ? "none" : "np";
  return { k: b, t: BOUNDS.find(([k]) => k === b)![1] };
}

export function AccessView({ perm, m }: { perm: Permissions; m: Model }) {
  const sites = m.nodes.filter((n) => n.kind === "site");
  const by = BOUNDS.map(([k, l]) => ({ k, l, ns: sites.filter((n) => boundary(n, perm)?.k === k) })).filter((x) => x.ns.length);
  const dis = perm.sites.filter((s) => s.disagrees).length;
  return (
    <>
      <p className="sy-s sy-lede">מי יכול להיכנס לאן ומה מותר לו לעשות. נסרק {when(perm.generated_at, m.gen)}. בלי סיסמאות ובלי תוכן: רק הרשאות ומספרים.</p>
      <h2 className="sy-sec">אנשים וזהויות <span className="sy-n"><bdi>{perm.identities.length}</bdi></span></h2>
      <ul className="mg-panel sy-rows" aria-label="אנשים וזהויות">
        {perm.identities.map((i) => (
          <li key={i.id} className="sy-row">
            <span className="sy-t"><Bidi t={i.label_he} /> <span className="sy-tag">של <Bidi t={i.owner_label_he || "לא ידוע"} /></span></span>
            <span className="sy-facts">
              {i.sudo && <span><b>הרשאת מנהל:</b> {SUDO[i.sudo] || i.sudo}{i.sudo_expires ? ` עד ${when(i.sudo_expires, m.gen)}` : ""}</span>}
              {i.authorized_keys != null && <span><b>מפתחות כניסה:</b> <bdi>{i.authorized_keys}</bdi></span>}
              {!!i.groups?.length && <span><b>קבוצות:</b> <Bidi t={i.groups.join(", ")} /></span>}
              {i.counts && <span><b>חשבונות:</b> מנהל <bdi>{i.counts.admin}</bdi>, משתמשים <bdi>{i.counts.user}</bdi></span>}
              {i.devices && <span><b>מכשירים:</b> <bdi>{i.devices.length}</bdi></span>}
            </span>
            {i.reach_he && <span className="sy-s"><Bidi t={i.reach_he} /></span>}
            {i.sudo_allowed_he && <span className="sy-s"><Bidi t={`מותר לו להריץ רק: ${i.sudo_allowed_he.join(", ")}`} /></span>}
            {!!i.devices?.length && <span className="sy-s"><Bidi t={i.devices.map((d) => (d.note_he ? `${d.name} (${d.note_he})` : d.name)).join(", ")} /></span>}
          </li>
        ))}
      </ul>
      <h2 className="sy-sec">איך נכנסים לכל אתר <span className="sy-n"><bdi>{sites.length}</bdi></span></h2>
      <div className="mg-panel sy-folds">
        {by.map((x) => (
          <details key={x.k} className="sy-fold">
            <summary>{x.l} <span className="sy-n"><bdi>{x.ns.length}</bdi></span></summary>
            <ul className="sy-rows">
              {x.ns.map((n) => {
                const p = perm.sites.find((s) => s.id === sid(n));
                const sub = [title(n) === n.name ? "" : title(n), p?.disagrees ? "הרישום לא מתאים למה שנמדד" : ""].filter(Boolean).join(" · ");
                return (
                  <li key={n.id} className="sy-row">
                    <span className="sy-t"><Link to={itemHref(n.id)}><bdi className="sy-ltr">{n.name}</bdi></Link><Whose n={n} /> <St k={nodeStatus(n).k} /></span>
                    {sub && <span className="sy-s"><Bidi t={sub} /></span>}
                  </li>
                );
              })}
            </ul>
          </details>
        ))}
      </div>
      <p className="sy-note">ב־<bdi>{dis}</bdi> מתוך <bdi>{perm.sites.length}</bdi> האתרים רישום הנכסים לא מתאים למה שנמדד, או לא יודע איזו הגנה יש. „לא נבדק” = האתר לא נבדק מבחוץ בסריקה הזו.</p>
      <h2 className="sy-sec">סמכות משותפת <span className="sy-n"><bdi>{perm.shared_authority.length}</bdi></span></h2>
      <ul className="mg-panel sy-rows">
        {perm.shared_authority.map((s) => (
          <li key={s.id} className="sy-row"><span className="sy-t"><Bidi t={s.label_he} /></span>{s.note_he && <span className="sy-s"><Bidi t={s.note_he} /></span>}</li>
        ))}
      </ul>
    </>
  );
}

const num = (v: unknown) => (v == null ? "?" : String(v));
function layers(sec: Security): { t: string; s: string; k: StatusK | "care"; chk?: string; at?: string }[] {
  const Y = sec.layers as Record<string, R | undefined>;
  const at = (x?: R) => String(x?.checked_at || sec.generated_at || "");
  const fw = Y.firewall, f2 = Y.fail2ban, sshd = Y.sshd, ts = Y.tailscale, cd = Y.caddy, ct = Y.containers, fe = Y.incus_fences, bk = Y.backups, up = Y.updates, mo = Y.monitoring;
  return [
    { t: "הכניסה מהאינטרנט", s: "מנהרת Cloudflare: חיבור יוצא בלבד, בלי פתח נכנס לשרת. מה שהנתב בבית חושף לא נבדק מהשרת.", k: "care", chk: "חלקית: הנתב לא נבדק", at: at(Y.internet_edge) },
    { t: "חומת האש", s: fw ? `${fw.active ? "פעילה" : "כבויה"}${fw.enabled_on_startup ? " ומופעלת גם בעליית השרת" : ""}, ${num(fw.rules)} כללים; כל השאר נחסם.${fw.owner_access_proven ? " הכניסה שלך מהטלפון נבדקה ועובדת." : ""}` : "", k: fw?.active ? (fw.deadman_pending ? "care" : "ok") : "down", at: at(fw) },
    { t: "חוסם ניסיונות כניסה", s: f2 ? `fail2ban פעיל: ${num(f2.currently_banned)} חסומים עכשיו, ${num(f2.total_banned)} נחסמו עד היום` : "", k: f2?.installed ? "ok" : "unk", at: at(f2) },
    { t: "כניסה מרחוק למחשב", s: sshd ? `SSH: סיסמה ${sshd.password_login ? "מותרת" : "כבויה"}, רק במפתח (${num((sshd.keys as R | undefined)?.devuser)} מפתחות). העברת חלונות, מנהרות וסוכן ${sshd.x11_forwarding || sshd.tcp_forwarding ? "עדיין מותרת" : "כבויה"}.` : "", k: sshd && !sshd.password_login && (sshd.x11_forwarding || sshd.tcp_forwarding) ? "care" : "ok", at: at(sshd) },
    { t: "הרשת הפרטית", s: ts ? `Tailscale: ${num(ts.devices)} מכשירים, ${num(ts.serve_entries)} כניסות, כולן רק מתוך הרשת. כללי הגישה של הרשת לא קריאים מהשרת.` : "", k: "ok", chk: "חלקית: כללי הגישה לא נבדקו", at: at(ts) },
    { t: "כניסה לאתרים", s: cd ? `${num(cd.site_files)} קובצי אתרים, ${num(cd.with_basic_auth)} עם סיסמה; ${num(cd.unreadable)} לא קריאים ולכן לא נבדקו.` : "", k: cd?.unreadable ? "care" : "ok", chk: cd?.unreadable ? `חלקית: ${cd.unreadable} לא נבדקו` : undefined, at: at(cd) },
    { t: "קונטיינרים", s: ct ? `${num(ct.running)} רצים; כל ${num(ct.published_ports)} הפתחים שלהם פתוחים רק בתוך השרת. ${num(ct.networks_untested_under_ufw)} רשתות עוד לא נבדקו מול חומת האש.` : "", k: ct?.networks_untested_under_ufw ? "care" : "ok", at: at(ct) },
    { t: "גדרות לסביבות האישיות", s: fe ? `${num(fe.containers)} סביבות (עדי, הרב, בדיקות) נעולות בגדרות רשת; בלי הרשאות מנהל.` : "", k: "ok", at: at(fe) },
    { t: "איפה שמורים הסודות", s: "במיקומים סגורים בלבד; אף קובץ סודות לא פתוח לקריאה לכולם. (רק מיקומים, בלי תוכן.)", k: "ok", at: sec.generated_at },
    { t: "גיבויים", s: bk ? `הגיבוי היומי שוחזר בהצלחה לפני ${num(Math.round(Number(bk.restore_verify_age_h)))} שעות.${bk.legacy_offbox_copy === "fail" ? ` העותק הישן מחוץ לשרת נכשל, לפני ${num(Math.round(Number(bk.legacy_offbox_age_h) / 24))} ימים.` : ""}` : "", k: bk?.legacy_offbox_copy === "fail" ? "care" : "ok", at: at(bk) },
    { t: "עדכוני תוכנה", s: up ? `${num(up.pending_total)} עדכונים ממתינים, ${num(up.security)} מהם עדכוני אבטחה.${up.reboot_planned ? ` אתחול מתוכנן ב־${up.reboot_planned}.` : ""}` : "", k: up?.security ? "down" : up?.pending_total ? "care" : "ok", at: at(up) },
    { t: "ניטור", s: mo ? `מרכז הבריאות פועל ומדווח${mo.host_watchdog_stale_since ? `; שומר החומרה לא מתעדכן מאז ${when(String(mo.host_watchdog_stale_since), null)}` : ""}.` : "", k: mo?.host_watchdog_stale_since ? "care" : "ok", at: at(mo) },
  ];
}

export function SecView({ sec, m, open }: { sec: Security; m: Model; open: string | null }) {
  const ord = { high: 0, medium: 1, low: 2 };
  const fs = [...sec.findings].sort((a, b) => ord[a.severity] - ord[b.severity] || Number(!!b.needs_owner) - Number(!!a.needs_owner));
  const nOwner = fs.filter((f) => f.needs_owner).length;
  return (
    <>
      <p className="sy-s sy-lede">מהאינטרנט פנימה: כל שכבה, מה מצבה ומה עוד לא נבדק. נסרק {when(sec.generated_at, m.gen)}; לכל שכבה מופיע מתי נמדדה.</p>
      <div className="sy-home">
        <div>
          <h2 className="sy-sec">שכבות ההגנה <span className="sy-n"><bdi>{layers(sec).length}</bdi></span></h2>
          <ol className="mg-panel sy-rows sy-layers" aria-label="שכבות ההגנה">
            {layers(sec).map((x, i) => (
              <li key={x.t} className="sy-row">
                <span className="sy-t"><span className="sy-num"><bdi>{i + 1}</bdi></span> {x.t} <St k={x.k as StatusK} /></span>
                <span className="sy-s"><Bidi t={x.s} /></span>
                <span className="sy-u">{x.chk || "נבדק"} · {when(x.at, m.gen)}</span>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <h2 className="sy-sec">ממצאים <span className="sy-n"><bdi>{fs.length}</bdi></span><span className="sy-end sy-s"><bdi>{nOwner}</bdi> צריכים אותך</span></h2>
          <ul className="mg-panel sy-rows sy-cards" aria-label="ממצאים">
            {fs.map((f) => (
              <li key={f.id} id={f.id}>
                <details open={open === f.id}>
                  <summary>
                    <span><span className={`sy-sev sy-sev-${f.severity}`}>{SEV[f.severity]}</span>{f.needs_owner && <> · <span className="sy-needs">צריך אותך</span></>}</span>
                    <span className="sy-t"><Bidi t={f.what_he} /></span>
                    <span className="sy-chev" aria-hidden="true">⌄</span>
                  </summary>
                  <dl className="sy-kv">
                    {f.why_it_matters_he && <div><dt>למה זה חשוב</dt><dd><Bidi t={f.why_it_matters_he} /></dd></div>}
                    {f.suggested_fix_he && <div><dt>מה מוצע</dt><dd><Bidi t={f.suggested_fix_he} /></dd></div>}
                    {f.node_id && m.N[f.node_id] && <div><dt>ברשומה</dt><dd><Link to={itemHref(f.node_id)}><Bidi t={title(m.N[f.node_id])} /></Link></dd></div>}
                    {f.evidence && <div><dt>ראיה</dt><dd><bdi className="sy-ltr">{f.evidence}</bdi></dd></div>}
                  </dl>
                </details>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
