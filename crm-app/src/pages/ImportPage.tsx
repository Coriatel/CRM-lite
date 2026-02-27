import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  SkipForward,
  Download,
  Loader2,
} from "lucide-react";
import * as XLSX from "xlsx";
import {
  getAllContacts,
  createContact,
  getTags,
  createTag,
  addContactTag,
  DirectusContact,
} from "../services/directus";
import { normalizeIsraeliPhone, isRealName } from "../services/phoneUtils";

// ---------- Types ----------

interface RawRow {
  name: string;
  phone: string;
  group?: string;
  sheetName: string;
}

type ImportAction = "new" | "merge" | "skip";

interface ImportRow {
  raw: RawRow;
  normalizedPhone: string;
  action: ImportAction;
  existingContactId?: string;
  existingName?: string;
}

// ---------- Dedup sheet names ----------
// נצור לשונך and סיפורי בעש"ט are identical
const DEDUP_SHEETS: Record<string, string> = {
  'סיפורי בעש"ט': "נצור לשונך",
};

// ---------- Component ----------

export function ImportPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);

  // Step 1: Upload
  const [file, setFile] = useState<File | null>(null);

  // Step 2: Parse & Normalize
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState("");

  // Step 3: Review (computed from rows)

  // Step 4: Execute
  const [executing, setExecuting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [totalToProcess, setTotalToProcess] = useState(0);
  const [importLog, setImportLog] = useState<string[]>([]);
  const [importDone, setImportDone] = useState(false);

  // ---------- Step 1: File selection ----------

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  // ---------- Step 2: Parse & Match ----------

  const parseAndMatch = useCallback(async () => {
    if (!file) return;
    setParsing(true);
    setParseError("");

    // File size check (max 10 MB)
    if (file.size > 10 * 1024 * 1024) {
      setParseError("הקובץ גדול מדי. גודל מקסימלי: 10MB");
      setParsing(false);
      return;
    }

    try {
      // Read Excel
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });

      // Parse all sheets
      const rawRows: RawRow[] = [];
      const seenSheets = new Set<string>();

      for (const sheetName of wb.SheetNames) {
        // Dedup identical sheets
        const canonical = DEDUP_SHEETS[sheetName] || sheetName;
        if (seenSheets.has(canonical)) continue;
        seenSheets.add(canonical);

        const ws = wb.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

        for (const row of data) {
          const name = String(row["שם"] ?? "").trim();
          const phone = row["טלפון"];
          const group = row["חבר בקבוצה"]
            ? String(row["חבר בקבוצה"]).trim()
            : undefined;

          // Skip unnamed / phone-as-name entries
          if (!isRealName(name)) continue;
          if (!phone) continue;

          rawRows.push({
            name,
            phone: String(phone),
            group,
            sheetName: canonical,
          });
        }
      }

      // Normalize phones
      const normalizedRows = rawRows.map((raw) => ({
        raw,
        normalizedPhone: normalizeIsraeliPhone(raw.phone),
      }));

      // Dedup within import: keep first occurrence per phone
      const phoneToRow = new Map<string, (typeof normalizedRows)[0]>();
      const dedupedRows: (typeof normalizedRows)[0][] = [];
      for (const r of normalizedRows) {
        if (!r.normalizedPhone) continue;
        if (!phoneToRow.has(r.normalizedPhone)) {
          phoneToRow.set(r.normalizedPhone, r);
          dedupedRows.push(r);
        }
      }

      // Fetch all existing contacts
      const existingContacts = await getAllContacts();
      const phoneMap = new Map<string, DirectusContact>();
      for (const c of existingContacts) {
        const p1 = normalizeIsraeliPhone(c.phone_e164);
        const p2 = normalizeIsraeliPhone(c.phone_raw);
        if (p1) phoneMap.set(p1, c);
        if (p2 && !phoneMap.has(p2)) phoneMap.set(p2, c);
      }

      // Match against existing
      const importRows: ImportRow[] = dedupedRows.map((r) => {
        const existing = phoneMap.get(r.normalizedPhone);
        if (existing) {
          // Check if name matches exactly → skip, otherwise merge
          const existingName = existing.full_name?.trim().toLowerCase();
          const importName = r.raw.name.trim().toLowerCase();
          const action: ImportAction =
            existingName === importName ? "skip" : "merge";
          return {
            raw: r.raw,
            normalizedPhone: r.normalizedPhone,
            action,
            existingContactId: existing.id,
            existingName: existing.full_name,
          };
        }
        return {
          raw: r.raw,
          normalizedPhone: r.normalizedPhone,
          action: "new" as ImportAction,
        };
      });

      setRows(importRows);
      setStep(3);
    } catch (err) {
      console.error("Parse error:", err);
      setParseError(String(err));
    } finally {
      setParsing(false);
    }
  }, [file]);

  // ---------- Step 3: Review ----------

  const newRows = rows.filter((r) => r.action === "new");
  const mergeRows = rows.filter((r) => r.action === "merge");
  const skipRows = rows.filter((r) => r.action === "skip");

  const toggleAction = (index: number) => {
    setRows((prev) => {
      const updated = [...prev];
      const row = updated[index];
      // Cycle: new → skip → new (for new), merge → skip → merge (for merge)
      const newAction: ImportAction =
        row.action === "skip"
          ? row.existingContactId
            ? "merge"
            : "new"
          : "skip";
      updated[index] = { ...row, action: newAction };
      return updated;
    });
  };

  // ---------- Step 4: Execute Import ----------

  const executeImport = useCallback(async () => {
    setExecuting(true);
    setProgress(0);
    setImportLog([]);

    const toProcess = rows.filter((r) => r.action !== "skip");
    setTotalToProcess(toProcess.length);

    try {
      // Backup: export all existing contacts to JSON (download)
      const existingContacts = await getAllContacts();
      const backupBlob = new Blob([JSON.stringify(existingContacts, null, 2)], {
        type: "application/json",
      });
      const backupUrl = URL.createObjectURL(backupBlob);
      const a = document.createElement("a");
      a.href = backupUrl;
      a.download = `contacts-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(backupUrl);
      setImportLog((prev) => [...prev, "גיבוי אנשי קשר הורד בהצלחה"]);

      // Ensure tags exist for all sheet names
      let tags = await getTags();
      const tagMap = new Map<string, string>();
      for (const t of tags) {
        tagMap.set(t.name, t.id);
      }

      const sheetNames = [...new Set(toProcess.map((r) => r.raw.sheetName))];
      for (const sn of sheetNames) {
        if (!tagMap.has(sn)) {
          const newTag = await createTag(sn);
          tagMap.set(sn, newTag.id);
          setImportLog((prev) => [...prev, `תג חדש נוצר: ${sn}`]);
        }
      }

      // Process in batches of 50
      const BATCH_SIZE = 50;
      let processed = 0;

      for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
        const batch = toProcess.slice(i, i + BATCH_SIZE);

        for (const row of batch) {
          try {
            if (row.action === "new") {
              // Create new contact
              const nameParts = row.raw.name.split(" ");
              const newContact = await createContact({
                full_name: row.raw.name,
                first_name: nameParts[0] || "",
                last_name: nameParts.slice(1).join(" ") || "",
                phone_e164: row.normalizedPhone,
                phone_raw: row.raw.phone,
                call_status: "not_checked",
              });

              // Add sheet tag
              const tagId = tagMap.get(row.raw.sheetName);
              if (tagId && newContact.id) {
                await addContactTag(newContact.id, tagId);
              }
            } else if (row.action === "merge" && row.existingContactId) {
              // Add sheet tag to existing contact
              const tagId = tagMap.get(row.raw.sheetName);
              if (tagId) {
                try {
                  await addContactTag(row.existingContactId, tagId);
                } catch {
                  // Tag might already exist — ignore duplicate
                }
              }
            }
          } catch (err) {
            console.error(`Error processing ${row.raw.name}:`, err);
            setImportLog((prev) => [
              ...prev,
              `שגיאה: ${row.raw.name} - ${String(err)}`,
            ]);
          }

          processed++;
          setProgress(processed);
        }

        setImportLog((prev) => [
          ...prev,
          `עובד... ${processed}/${toProcess.length}`,
        ]);
      }

      setImportLog((prev) => [
        ...prev,
        `יבוא הושלם! ${processed} אנשי קשר עובדו.`,
      ]);
      setImportDone(true);
    } catch (err) {
      console.error("Import error:", err);
      setImportLog((prev) => [...prev, `שגיאת יבוא: ${String(err)}`]);
    } finally {
      setExecuting(false);
    }
  }, [rows]);

  // ---------- Render ----------

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
      }}
    >
      {/* Header */}
      <header
        className="header"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--spacing-sm)",
        }}
      >
        <button
          className="header-btn"
          onClick={() => navigate(-1)}
          style={{ padding: "6px" }}
        >
          <ArrowRight size={20} />
        </button>
        <h1 className="header-title" style={{ flex: 1 }}>
          יבוא אנשי קשר
        </h1>
        <span
          style={{
            color: "rgba(255,255,255,0.7)",
            fontSize: "13px",
          }}
        >
          שלב {step}/4
        </span>
      </header>

      {/* Progress indicator */}
      <div
        style={{
          display: "flex",
          gap: "4px",
          padding: "0 var(--spacing-md)",
          marginTop: "var(--spacing-sm)",
        }}
      >
        {[1, 2, 3, 4].map((s) => (
          <div
            key={s}
            style={{
              flex: 1,
              height: "4px",
              borderRadius: "2px",
              background:
                s <= step ? "var(--color-primary)" : "var(--color-border)",
              transition: "background 0.3s",
            }}
          />
        ))}
      </div>

      {/* Content */}
      <main
        className="main-content"
        style={{ overflowY: "auto", flex: 1, minHeight: 0 }}
      >
        {/* Step 1: Upload */}
        {step === 1 && (
          <div>
            <h2 style={{ fontSize: "18px", marginBottom: "var(--spacing-md)" }}>
              העלאת קובץ אקסל
            </h2>
            <p
              style={{
                fontSize: "14px",
                color: "var(--color-text-secondary)",
                marginBottom: "var(--spacing-lg)",
              }}
            >
              בחר קובץ Excel (.xlsx) עם אנשי הקשר מוואטסאפ. הקובץ צריך לכלול
              עמודות: שם, טלפון.
            </p>

            <label
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                border: "2px dashed var(--color-border)",
                borderRadius: "12px",
                padding: "var(--spacing-xl)",
                cursor: "pointer",
                textAlign: "center",
                background: file
                  ? "rgba(34, 197, 94, 0.05)"
                  : "var(--color-bg-secondary, #f1f5f9)",
                transition: "background 0.2s",
              }}
            >
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileSelect}
                style={{ display: "none" }}
              />
              {file ? (
                <>
                  <CheckCircle2
                    size={40}
                    style={{
                      color: "var(--color-success)",
                      marginBottom: "8px",
                    }}
                  />
                  <span style={{ fontWeight: 600 }}>{file.name}</span>
                  <span
                    style={{
                      fontSize: "13px",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    {(file.size / 1024).toFixed(0)} KB
                  </span>
                </>
              ) : (
                <>
                  <Upload
                    size={40}
                    style={{
                      color: "var(--color-text-secondary)",
                      marginBottom: "8px",
                    }}
                  />
                  <span style={{ fontWeight: 500 }}>לחץ לבחירת קובץ</span>
                  <span
                    style={{
                      fontSize: "13px",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    .xlsx או .xls
                  </span>
                </>
              )}
            </label>

            <button
              onClick={() => {
                setStep(2);
                parseAndMatch();
              }}
              disabled={!file}
              style={{
                width: "100%",
                marginTop: "var(--spacing-lg)",
                padding: "12px",
                borderRadius: "8px",
                border: "none",
                background: "var(--color-primary)",
                color: "#fff",
                fontSize: "16px",
                fontWeight: 600,
                cursor: file ? "pointer" : "not-allowed",
                opacity: file ? 1 : 0.5,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              <ArrowLeft size={18} />
              המשך לניתוח
            </button>
          </div>
        )}

        {/* Step 2: Parsing */}
        {step === 2 && (
          <div
            style={{
              textAlign: "center",
              padding: "var(--spacing-xl)",
            }}
          >
            {parsing ? (
              <>
                <Loader2
                  size={48}
                  style={{
                    color: "var(--color-primary)",
                    animation: "spin 1s linear infinite",
                    marginBottom: "var(--spacing-md)",
                  }}
                />
                <p style={{ fontWeight: 600, fontSize: "16px" }}>
                  מנתח את הקובץ...
                </p>
                <p
                  style={{
                    fontSize: "14px",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  מנרמל מספרי טלפון ומשווה מול אנשי קשר קיימים
                </p>
              </>
            ) : parseError ? (
              <>
                <AlertCircle
                  size={48}
                  style={{
                    color: "var(--color-danger, #ef4444)",
                    marginBottom: "var(--spacing-md)",
                  }}
                />
                <p
                  style={{
                    fontWeight: 600,
                    fontSize: "16px",
                    color: "var(--color-danger, #ef4444)",
                  }}
                >
                  שגיאה בניתוח הקובץ
                </p>
                <p
                  style={{
                    fontSize: "14px",
                    color: "var(--color-text-secondary)",
                    marginBottom: "var(--spacing-md)",
                  }}
                >
                  {parseError}
                </p>
                <button className="btn btn-primary" onClick={() => setStep(1)}>
                  חזור
                </button>
              </>
            ) : null}
          </div>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <div>
            <h2 style={{ fontSize: "18px", marginBottom: "var(--spacing-sm)" }}>
              סיכום ניתוח
            </h2>

            {/* Summary cards */}
            <div
              className="stats"
              style={{
                gridTemplateColumns: "repeat(3, 1fr)",
                marginBottom: "var(--spacing-md)",
              }}
            >
              <div
                className="stat-card"
                style={{ borderRight: "3px solid var(--color-success)" }}
              >
                <div
                  className="stat-value"
                  style={{ color: "var(--color-success)" }}
                >
                  {newRows.length}
                </div>
                <div className="stat-label">חדשים</div>
              </div>
              <div
                className="stat-card"
                style={{ borderRight: "3px solid var(--color-warning)" }}
              >
                <div
                  className="stat-value"
                  style={{ color: "var(--color-warning)" }}
                >
                  {mergeRows.length}
                </div>
                <div className="stat-label">מיזוג</div>
              </div>
              <div
                className="stat-card"
                style={{ borderRight: "3px solid var(--color-text-secondary)" }}
              >
                <div
                  className="stat-value"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {skipRows.length}
                </div>
                <div className="stat-label">דילוג</div>
              </div>
            </div>

            {/* List */}
            <div style={{ marginBottom: "var(--spacing-md)" }}>
              <h3
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  marginBottom: "var(--spacing-xs)",
                  color: "var(--color-text-secondary)",
                }}
              >
                לחץ על שורה לשנות פעולה
              </h3>

              {rows.map((row, idx) => (
                <div
                  key={idx}
                  onClick={() => toggleAction(idx)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--spacing-sm)",
                    padding: "8px var(--spacing-sm)",
                    borderBottom: "1px solid var(--color-border)",
                    cursor: "pointer",
                    opacity: row.action === "skip" ? 0.5 : 1,
                  }}
                >
                  {/* Action badge */}
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      padding: "2px 6px",
                      borderRadius: "4px",
                      flexShrink: 0,
                      background:
                        row.action === "new"
                          ? "rgba(34,197,94,0.15)"
                          : row.action === "merge"
                            ? "rgba(234,179,8,0.15)"
                            : "rgba(107,114,128,0.15)",
                      color:
                        row.action === "new"
                          ? "var(--color-success)"
                          : row.action === "merge"
                            ? "#b45309"
                            : "var(--color-text-secondary)",
                    }}
                  >
                    {row.action === "new"
                      ? "חדש"
                      : row.action === "merge"
                        ? "מיזוג"
                        : "דילוג"}
                  </span>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "14px",
                        fontWeight: 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {row.raw.name}
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      <span dir="ltr">{row.normalizedPhone}</span>
                      {" · "}
                      {row.raw.sheetName}
                      {row.action === "merge" && row.existingName && (
                        <span> ← {row.existingName}</span>
                      )}
                    </div>
                  </div>

                  {/* Toggle icon */}
                  {row.action === "skip" ? (
                    <SkipForward
                      size={14}
                      style={{ color: "var(--color-text-secondary)" }}
                    />
                  ) : (
                    <CheckCircle2
                      size={14}
                      style={{
                        color:
                          row.action === "new"
                            ? "var(--color-success)"
                            : "var(--color-warning)",
                      }}
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: "var(--spacing-sm)" }}>
              <button
                onClick={() => setStep(1)}
                style={{
                  padding: "12px 16px",
                  borderRadius: "8px",
                  border: "1px solid var(--color-border)",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: "14px",
                }}
              >
                חזור
              </button>
              <button
                onClick={() => {
                  setStep(4);
                  executeImport();
                }}
                disabled={newRows.length + mergeRows.length === 0}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: "8px",
                  border: "none",
                  background: "var(--color-primary)",
                  color: "#fff",
                  fontSize: "16px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  opacity: newRows.length + mergeRows.length === 0 ? 0.5 : 1,
                }}
              >
                <Download size={18} />
                יבוא {newRows.length + mergeRows.length} אנשי קשר
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Execute */}
        {step === 4 && (
          <div>
            <h2 style={{ fontSize: "18px", marginBottom: "var(--spacing-md)" }}>
              {importDone ? "יבוא הושלם!" : "מייבא אנשי קשר..."}
            </h2>

            {/* Progress bar */}
            {totalToProcess > 0 && (
              <div style={{ marginBottom: "var(--spacing-md)" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "13px",
                    color: "var(--color-text-secondary)",
                    marginBottom: "4px",
                  }}
                >
                  <span>
                    {progress} / {totalToProcess}
                  </span>
                  <span>{Math.round((progress / totalToProcess) * 100)}%</span>
                </div>
                <div
                  style={{
                    height: "8px",
                    borderRadius: "4px",
                    background: "var(--color-bg-secondary, #f1f5f9)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${(progress / totalToProcess) * 100}%`,
                      borderRadius: "4px",
                      background: importDone
                        ? "var(--color-success)"
                        : "var(--color-primary)",
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
              </div>
            )}

            {/* Log */}
            <div
              style={{
                background: "var(--color-bg-secondary, #f1f5f9)",
                borderRadius: "8px",
                padding: "var(--spacing-sm)",
                maxHeight: "300px",
                overflowY: "auto",
                fontSize: "13px",
                fontFamily: "monospace",
                direction: "rtl",
              }}
            >
              {importLog.map((line, i) => (
                <div
                  key={i}
                  style={{
                    padding: "2px 0",
                    color: line.includes("שגיאה")
                      ? "var(--color-danger, #ef4444)"
                      : "var(--color-text)",
                  }}
                >
                  {line}
                </div>
              ))}
              {executing && (
                <div style={{ color: "var(--color-text-secondary)" }}>
                  <Loader2
                    size={12}
                    style={{
                      display: "inline",
                      animation: "spin 1s linear infinite",
                    }}
                  />{" "}
                  עובד...
                </div>
              )}
            </div>

            {/* Done actions */}
            {importDone && (
              <div
                style={{
                  display: "flex",
                  gap: "var(--spacing-sm)",
                  marginTop: "var(--spacing-lg)",
                }}
              >
                <button
                  onClick={() => navigate("/")}
                  style={{
                    flex: 1,
                    padding: "12px",
                    borderRadius: "8px",
                    border: "none",
                    background: "var(--color-primary)",
                    color: "#fff",
                    fontSize: "16px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  חזור לאנשי קשר
                </button>
              </div>
            )}
          </div>
        )}

        {/* Bottom spacer */}
        <div style={{ height: "var(--spacing-lg)" }} />
      </main>
    </div>
  );
}
