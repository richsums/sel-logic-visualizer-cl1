// ─── SEL SER (Sequence of Events Recorder) parser ───────────────────────────
//
// Handles the most common SER export formats from SEL relays and AcSELerator:
//   • CSV with quoted fields: "Date","Time","Row #","Event","State"
//   • Tab-separated or space-aligned plain text
//   • Combined date+time column variants
// ─────────────────────────────────────────────────────────────────────────────

export type ElementClass =
  | 'protection'  // 50, 51, 27, 59, 21, 67 pickup / time-overcurrent elements
  | 'timer'       // SVxT, PCTxT, element T-bits (time-delayed qualify bits)
  | 'output'      // TRIP, CLOSE, OUT101-OUT116, alarm outputs
  | 'input'       // IN101-IN116 physical contact inputs
  | 'latch'       // PLT (programmable latch), LT bits
  | 'variable'    // SV, PSV SELOGIC control variables
  | 'breaker'     // 52A, 52B breaker status contacts
  | 'reclose'     // 79 reclosing bits
  | 'breaker_fail'// BF, 86 breaker failure bits
  | 'unknown';

export interface SEREvent {
  index: number;
  date: string;
  time: string;
  timestampDisplay: string;  // combined "MM/DD/YYYY HH:MM:SS.mmm"
  timestampMs: number;       // milliseconds from first event (for timeline positioning)
  absoluteMs: number;        // parsed absolute ms since epoch (best-effort)
  elementId: string;
  state: 'asserted' | 'deasserted';
  rawState: string;
  description: string;
  elementClass: ElementClass;
}

export interface SERParseResult {
  events: SEREvent[];
  warnings: string[];
  totalLines: number;
  skippedLines: number;
}

// ─── Element classification ──────────────────────────────────────────────────

export function classifyElement(id: string): ElementClass {
  const u = id.toUpperCase().trim();

  if (/^(TRIP|TR\d*|CLOSE|CL\d*|OUT\d+|AL\d*|ALARM\d*|TRIP\d*|CLOSE\d*)$/.test(u)) return 'output';
  if (/^52[AB]$/.test(u)) return 'breaker';
  if (/^(BF|BFI|BFT|86|86BF|BFPU|BFQ)$/.test(u)) return 'breaker_fail';
  if (/^79[A-Z0-9]*$/.test(u)) return 'reclose';
  if (/^(PLT\d+|LT\d+)$/.test(u)) return 'latch';
  if (/^(SV|PSV)\d+$/.test(u)) return 'variable';
  if (/^(SV\d+T|PCT\d+T?)$/.test(u)) return 'timer';
  if (/^IN\d{2,3}$/.test(u)) return 'input';
  // Protection element T-bits (time-delayed, e.g. 51P1T, 50P1T, 67P1T)
  if (/^\d{2}[A-Z]+\d*T$/.test(u)) return 'timer';
  // Protection element pickup flags (e.g. 51P1, 50G1, 27P, 59N)
  if (/^\d{2}[A-Z]+\d*$/.test(u)) return 'protection';

  return 'unknown';
}

export function describeElement(id: string): string {
  const u = id.toUpperCase().trim();
  const cls = classifyElement(id);

  switch (cls) {
    case 'output': {
      if (/^(TRIP|TR\d*)$/.test(u)) return 'Trip output';
      if (/^(CLOSE|CL\d*)$/.test(u)) return 'Close output';
      if (/^OUT\d+$/.test(u)) return `Output contact ${u}`;
      if (/^AL/.test(u) || /^ALARM/.test(u)) return 'Alarm output';
      return 'Output bit';
    }
    case 'breaker': return u === '52A' ? 'Breaker auxiliary (closed)' : 'Breaker auxiliary (open)';
    case 'breaker_fail': return 'Breaker failure element';
    case 'reclose': return 'Reclosing function bit';
    case 'latch': return u.startsWith('PLT') ? `Programmable latch ${u}` : `Latch bit ${u}`;
    case 'variable': return u.startsWith('PSV') ? `Protected SELOGIC variable ${u}` : `SELOGIC variable ${u}`;
    case 'timer': {
      if (/^SV\d+T$/.test(u)) return `SV timer pickup qualified ${u}`;
      if (/^PCT\d+T?$/.test(u)) return `PCT timer element ${u}`;
      return `Timer-delayed pickup bit ${u}`;
    }
    case 'input': return `Physical contact input ${u}`;
    case 'protection': {
      const numMatch = u.match(/^(\d{2})/);
      const elem = numMatch?.[1];
      const labels: Record<string, string> = {
        '50': 'Instantaneous overcurrent',
        '51': 'Time-overcurrent',
        '27': 'Undervoltage',
        '59': 'Overvoltage',
        '21': 'Distance element',
        '67': 'Directional overcurrent',
        '81': 'Frequency element',
        '46': 'Negative-sequence overcurrent',
        '47': 'Negative-sequence voltage',
        '87': 'Differential protection',
        '60': 'Voltage balance / loss-of-potential',
        '25': 'Synchronism check',
        '32': 'Directional power',
        '40': 'Loss of field',
        '64': 'Ground fault detection',
      };
      const label = elem ? labels[elem] ?? `Element ${elem}` : 'Protection element';
      return `${label} (${u})`;
    }
    default: return `Relay word bit ${u}`;
  }
}

// ─── Timestamp parsing ────────────────────────────────────────────────────────

function parseTimestampMs(date: string, time: string): number {
  // Attempt to build a JS Date from common SEL date/time formats
  // Date: MM/DD/YYYY or MM/DD/YY or YYYY-MM-DD
  // Time: HH:MM:SS.mmm or HH:MM:SS:mmm
  const normalizedDate = date.trim().replace(/-/g, '/');
  const normalizedTime = time.trim().replace(/[,:](\d{3})$/, '.$1');

  // Try different date formats
  let isoStr: string | null = null;
  const ddmmyy = normalizedDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (ddmmyy) {
    let year = parseInt(ddmmyy[3], 10);
    if (year < 100) year += year < 70 ? 2000 : 1900;
    const month = ddmmyy[1].padStart(2, '0');
    const day = ddmmyy[2].padStart(2, '0');
    isoStr = `${year}-${month}-${day}T${normalizedTime}`;
  }
  const yyyymm = normalizedDate.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (yyyymm) {
    isoStr = `${yyyymm[1]}-${yyyymm[2].padStart(2, '0')}-${yyyymm[3].padStart(2, '0')}T${normalizedTime}`;
  }

  if (isoStr) {
    const d = new Date(isoStr);
    if (!isNaN(d.getTime())) return d.getTime();
  }
  return 0;
}

// ─── Row parsing ──────────────────────────────────────────────────────────────

function normalizeState(raw: string): 'asserted' | 'deasserted' {
  const u = raw.toUpperCase().trim();
  if (u === 'IN' || u === '1' || u === 'ASSERT' || u === 'ASSERTED' || u === 'SET' || u === 'ON' || u === 'PICKED' || u === 'HIGH') return 'asserted';
  return 'deasserted';
}

function splitCSVRow(line: string): string[] {
  // Handle both quoted CSV and plain-delimiter splits
  if (line.includes('"')) {
    const fields: string[] = [];
    let inQuote = false;
    let current = '';
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; continue; }
      if ((ch === ',' || ch === '\t') && !inQuote) { fields.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    fields.push(current.trim());
    return fields;
  }
  // Try comma first, then tab, then 2+ spaces
  if (line.includes(',')) return line.split(',').map(f => f.trim());
  if (line.includes('\t')) return line.split('\t').map(f => f.trim());
  return line.split(/\s{2,}/).map(f => f.trim()).filter(Boolean);
}

// Detect if a token looks like a date
function isDateToken(s: string): boolean {
  return /^\d{1,4}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(s.trim());
}
// Detect if a token looks like a time
function isTimeToken(s: string): boolean {
  return /^\d{1,2}:\d{2}:\d{2}/.test(s.trim());
}
// Detect if a token is a row number
function isRowNumber(s: string): boolean {
  return /^\d{1,6}$/.test(s.trim());
}
// Detect if a token looks like a state
function isStateToken(s: string): boolean {
  const u = s.toUpperCase().trim();
  return ['IN', 'OUT', '1', '0', 'ASSERT', 'ASSERTED', 'DEASSERTED', 'SET', 'RESET', 'ON', 'OFF', 'PICKED', 'HIGH', 'LOW'].includes(u);
}
// Detect header-like row
function isHeaderRow(fields: string[]): boolean {
  const strs = fields.map(f => f.toUpperCase().trim());
  return strs.some(s =>
    s === 'DATE' || s === 'TIME' || s === 'ROW' || s === 'ROW #' || s === 'EVENT' ||
    s === 'STATE' || s === 'ELEMENT' || s === 'DESCRIPTION'
  );
}

interface ParsedRow {
  date: string;
  time: string;
  elementId: string;
  state: string;
}

function tryParseRow(fields: string[]): ParsedRow | null {
  if (fields.length < 3) return null;

  let date = '';
  let time = '';
  let elementId = '';
  let state = '';

  // Find date, time, state, elementId by type-detection
  const remaining: string[] = [];
  for (const f of fields) {
    if (!date && isDateToken(f)) { date = f; continue; }
    if (!time && isTimeToken(f)) { time = f; continue; }
    if (!state && isStateToken(f)) { state = f; continue; }
    if (isRowNumber(f)) continue; // skip row numbers
    remaining.push(f);
  }

  // The element ID is whatever is left; take the first non-empty remainder
  elementId = remaining.find(r => r.length > 0 && !/^[-=]+$/.test(r)) ?? '';

  if (!date || !time || !elementId || !state) return null;
  if (elementId.length > 20) return null; // sanity: element IDs shouldn't be very long
  if (/\s/.test(elementId)) return null;   // IDs don't have spaces

  return { date, time, elementId, state };
}

// Handle combined date+time in a single column like "11/15/2023 10:25:43.243"
function trySplitDatetime(col: string): { date: string; time: string } | null {
  const m = col.match(/^(\d{1,4}[\/\-]\d{1,2}[\/\-]\d{2,4})\s+(\d{1,2}:\d{2}:\d{2}[\.,]\d{1,6})$/);
  if (m) return { date: m[1], time: m[2] };
  return null;
}

// ─── Main parser ──────────────────────────────────────────────────────────────

export function parseSERText(text: string): SERParseResult {
  const warnings: string[] = [];
  const events: SEREvent[] = [];

  const lines = text.split(/\r?\n/);
  const totalLines = lines.length;
  let skippedLines = 0;
  let eventIndex = 0;

  // Detect header to skip
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li].trim();
    if (!line || line.startsWith('#') || line.startsWith('*') || line.startsWith('=') || line.startsWith('-')) {
      skippedLines++;
      continue;
    }

    // Split into fields
    let fields = splitCSVRow(line);

    // Skip header rows
    if (isHeaderRow(fields)) {
      skippedLines++;
      continue;
    }

    // Handle combined datetime in first field
    if (fields.length >= 1) {
      const dt = trySplitDatetime(fields[0]);
      if (dt) {
        // Replace first field with two fields: date + time
        fields = [dt.date, dt.time, ...fields.slice(1)];
      }
    }

    const parsed = tryParseRow(fields);
    if (!parsed) {
      skippedLines++;
      continue;
    }

    const absMs = parseTimestampMs(parsed.date, parsed.time);
    const cls = classifyElement(parsed.elementId);
    const desc = describeElement(parsed.elementId);
    const state = normalizeState(parsed.state);

    events.push({
      index: ++eventIndex,
      date: parsed.date,
      time: parsed.time,
      timestampDisplay: `${parsed.date} ${parsed.time}`,
      timestampMs: 0, // filled after all events collected
      absoluteMs: absMs,
      elementId: parsed.elementId.toUpperCase(),
      state,
      rawState: parsed.state,
      description: desc,
      elementClass: cls,
    });
  }

  // Compute relative timestamps from first event
  if (events.length > 0) {
    const firstMs = events[0].absoluteMs;
    for (const ev of events) {
      ev.timestampMs = ev.absoluteMs > 0 && firstMs > 0 ? ev.absoluteMs - firstMs : 0;
    }
  }

  if (events.length === 0 && totalLines > 5) {
    warnings.push('No parseable SER events found. Check that the file is a valid SEL SER export (.txt).');
  }

  return { events, warnings, totalLines, skippedLines };
}

// ─── Helpers for the timeline component ──────────────────────────────────────

/** Group events by 1-second "bursts" to cluster close events visually */
export function groupEventsByBurst(events: SEREvent[], gapMs = 100): SEREvent[][] {
  if (events.length === 0) return [];
  const groups: SEREvent[][] = [];
  let current: SEREvent[] = [events[0]];

  for (let i = 1; i < events.length; i++) {
    const prev = events[i - 1];
    const curr = events[i];
    const gap = curr.absoluteMs > 0 && prev.absoluteMs > 0
      ? curr.absoluteMs - prev.absoluteMs
      : 0;

    if (gap > gapMs) {
      groups.push(current);
      current = [curr];
    } else {
      current.push(curr);
    }
  }
  groups.push(current);
  return groups;
}

/** Format a relative millisecond offset nicely */
export function formatRelMs(ms: number): string {
  if (ms === 0) return 'T+0';
  if (ms < 0) return `T${(ms / 1000).toFixed(3)}s`;
  if (ms < 1000) return `T+${ms.toFixed(1)}ms`;
  return `T+${(ms / 1000).toFixed(3)}s`;
}
