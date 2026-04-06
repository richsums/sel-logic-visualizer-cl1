// ─── Importer types ───────────────────────────────────────────────────────────

export type LineKind =
  | 'setting'   // name = value
  | 'header'    // section header / banner
  | 'blank'
  | 'comment'
  | 'unknown';

export interface RawLine {
  index: number;       // 0-based
  raw: string;
  kind: LineKind;
}

/**
 * SEL relay setting categories matching actual relay organization:
 * - element: Protection element parameters (pickups, curves, time dials, enables)
 *            Corresponds to Group Settings (SHO SET 1..6)
 * - logic:   SELOGIC control equations (TR, CL, OUTxxx, SVxx, LTxx, SETxx, RSTxx)
 *            Corresponds to Logic Settings (SHO SET L)
 * - global:  System-wide parameters (CTR, PTR, NFREQ, RID, port config)
 *            Corresponds to Global Settings (SHO SET G)
 */
export type SettingCategory = 'element' | 'logic' | 'global';

export interface ImportedSetting {
  name: string;
  value: string;
  category: SettingCategory;
  rawLine: RawLine;
}

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface ParseDiagnostic {
  severity: DiagnosticSeverity;
  message: string;
  lineIndex?: number;
  rawText?: string;
}

export interface ImportedSettingsDocument {
  id: string;
  label: string;
  rawText: string;
  lines: RawLine[];
  settings: ImportedSetting[];
  diagnostics: ParseDiagnostic[];
}
