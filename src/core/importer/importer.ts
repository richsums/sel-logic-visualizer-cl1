// ─── Raw settings importer ────────────────────────────────────────────────────
// Supports two input formats:
//   1. QuickSet terminal (SHO SET):  NAME = VALUE
//   2. Relay .txt export (CSV):      NAME,"VALUE"
import type {
  ImportedSettingsDocument,
  ImportedSetting,
  ParseDiagnostic,
  RawLine,
  LineKind,
} from './types';
import { classifySetting } from './classifier';

function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function normalizeLine(raw: string): string {
  // Strip ALL non-printable control characters (carriage returns, null bytes,
  // EOF markers, BOM, etc.) that SEL relay exports may contain.
  // Keep only printable ASCII + extended Unicode, tabs, and spaces.
  return raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\r\xEF\xBB\xBF]/g, '').trimEnd();
}

// ─── Line classifier ──────────────────────────────────────────────────────────

function classifyLine(line: string): LineKind {
  const trimmed = line.trim();
  if (trimmed === '') return 'blank';

  // Section headers/banners: lines starting with =, -, *, #
  if (/^[=\-*#]{3,}/.test(trimmed)) return 'header';

  // Comment-like lines (;, #, * used as inline comments in some QuickSet output)
  // But * alone at start is a header already caught above; only flag if followed by text after space
  if (/^\s*[;]/.test(line)) return 'comment';

  // CSV format: NAME,"VALUE"  (relay .txt export)
  // Name: alphanumeric + underscore, may start with digit
  if (/^[A-Z0-9][A-Z0-9_]*,"/i.test(trimmed)) return 'setting';

  // QuickSet terminal format: NAME = VALUE  or  NAME : VALUE
  if (/^[A-Z0-9][A-Z0-9_]*\s*[=:]/i.test(trimmed)) return 'setting';

  // * comment lines in QuickSet (lines starting with * followed by text are comments)
  if (/^\*\s+/.test(trimmed)) return 'comment';

  return 'unknown';
}

// ─── Setting extractor ────────────────────────────────────────────────────────

function extractSetting(line: string): { name: string; value: string } | null {
  const trimmed = line.trim();

  // CSV format: NAME,"VALUE"  (quotes mandatory, value may contain commas)
  // Also handles: NAME,"" (empty value) and NAME,"value with, commas"
  const csvMatch = trimmed.match(/^([A-Z0-9][A-Z0-9_]*),"(.*)"$/i);
  if (csvMatch) {
    return { name: csvMatch[1].toUpperCase(), value: csvMatch[2] };
  }

  // CSV without quotes: NAME,VALUE
  const csvBare = trimmed.match(/^([A-Z0-9][A-Z0-9_]*),([^,"]*)$/i);
  if (csvBare) {
    return { name: csvBare[1].toUpperCase(), value: csvBare[2].trim() };
  }

  // QuickSet terminal format: NAME = VALUE  or  NAME : VALUE
  const eqMatch = trimmed.match(/^([A-Z0-9][A-Z0-9_]*)\s*[=:]\s*(.*?)\s*$/i);
  if (eqMatch) {
    return { name: eqMatch[1].toUpperCase(), value: eqMatch[2] };
  }

  return null;
}

// ─── Main importer ────────────────────────────────────────────────────────────

export function importSettings(
  rawText: string,
  label = 'Untitled'
): ImportedSettingsDocument {
  const diagnostics: ParseDiagnostic[] = [];
  const rawLines = rawText.split('\n');

  const lines: RawLine[] = rawLines.map((raw, index) => {
    const normalised = normalizeLine(raw);
    const kind = classifyLine(normalised);
    return { index, raw: normalised, kind };
  });

  const settings: ImportedSetting[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    if (line.kind !== 'setting') continue;
    const extracted = extractSetting(line.raw);
    if (!extracted) {
      diagnostics.push({
        severity: 'warning',
        message: `Could not extract name/value from setting line`,
        lineIndex: line.index,
        rawText: line.raw,
      });
      continue;
    }
    // Keep first occurrence of duplicate names (last group wins in some relays — keep first)
    if (seen.has(extracted.name)) continue;
    seen.add(extracted.name);
    const category = classifySetting(extracted.name, extracted.value);
    settings.push({ name: extracted.name, value: extracted.value, category, rawLine: line });
  }

  if (settings.length === 0) {
    diagnostics.push({
      severity: 'info',
      message: 'No settings parsed. Paste SHO SET output or import a relay .txt settings file.',
    });
  }

  return { id: makeId(), label, rawText, lines, settings, diagnostics };
}

// ─── Multi-file merge importer ──────────────────────────────────────────────
// Merges three SEL settings files (Set_1, Set_L1, Set_G) into a single doc.

export function importAndMerge(
  files: { text: string; fileLabel: string }[],
  label = 'Merged Settings'
): ImportedSettingsDocument {
  const allSettings: ImportedSetting[] = [];
  const allLines: RawLine[] = [];
  const allDiagnostics: ParseDiagnostic[] = [];
  const allRawParts: string[] = [];
  const seen = new Set<string>();
  let lineOffset = 0;

  for (const { text, fileLabel } of files) {
    if (!text.trim()) continue;
    const rawLines = text.split('\n');
    allRawParts.push(`# --- ${fileLabel} ---\n${text}`);

    const lines: RawLine[] = rawLines.map((raw, index) => {
      const normalised = normalizeLine(raw);
      const kind = classifyLine(normalised);
      return { index: index + lineOffset, raw: normalised, kind };
    });

    for (const line of lines) {
      allLines.push(line);
      if (line.kind !== 'setting') continue;
      const extracted = extractSetting(line.raw);
      if (!extracted) {
        allDiagnostics.push({
          severity: 'warning',
          message: `[${fileLabel}] Could not extract name/value from setting line`,
          lineIndex: line.index,
          rawText: line.raw,
        });
        continue;
      }
      if (seen.has(extracted.name)) continue;
      seen.add(extracted.name);
      const category = classifySetting(extracted.name, extracted.value);
      allSettings.push({ name: extracted.name, value: extracted.value, category, rawLine: line });
    }

    lineOffset += rawLines.length;
  }

  if (allSettings.length === 0) {
    allDiagnostics.push({
      severity: 'info',
      message: 'No settings parsed from any of the uploaded files.',
    });
  }

  return {
    id: makeId(),
    label,
    rawText: allRawParts.join('\n'),
    lines: allLines,
    settings: allSettings,
    diagnostics: allDiagnostics,
  };
}
