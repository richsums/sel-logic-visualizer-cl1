// ─── SEL Setting Classifier ──────────────────────────────────────────────────
// Classifies each setting into Element, Logic, or Global based on SEL relay
// naming conventions across 3-Series, 4-Series, and 7-Series platforms.

import type { SettingCategory } from './types';

// ─── Logic Settings ──────────────────────────────────────────────────────────
// SELOGIC control equations: trip/close, output contacts, SELOGIC variables,
// latches, supervisory, pushbutton logic, group select equations, etc.
// These settings contain Boolean logic expressions wiring protection elements
// to physical outputs.

const LOGIC_EXACT = new Set([
  // Trip and close
  'TR', 'CL', 'TRIP', 'CLOSE', 'ULTRIP', 'ULCL',
  // Breaker failure
  'BFI', 'BFT', 'BF',
  // Lockout
  '86', '86BF',
  // Alarm
  'ALARM', 'ALM', 'ALRMOUT', 'SALARM',
  // Bus/multi-trip
  'TRIP_BUS', 'TRIP_A', 'TRIP_B', 'TRIP_C',
]);

const LOGIC_PATTERNS: RegExp[] = [
  // Output contacts: OUT101-OUT116, OUT201-OUT212, OUT301-OUT308
  /^OUT[0-9]{3}$/,
  // Display points: DP1-DP16
  /^DP[0-9]{1,2}$/,
  // Front panel LEDs: LED1-LED26
  /^LED[0-9]{1,2}$/,
  // SELOGIC variables: SV01-SV64 (equations), SV01PU, SV01DO (timers tied to SV)
  /^SV[0-9]{2}$/,
  /^SV[0-9]{2}(PU|DO|IN)$/,
  // Protected SELOGIC variables: PSV01-PSV64
  /^PSV[0-9]{2}$/,
  /^PSV[0-9]{2}(PU|DO|IN)$/,
  // Latch set/reset: SET01-SET32, RST01-RST32
  /^SET[0-9]{2}$/,
  /^RST[0-9]{2}$/,
  // Latch bits referenced as settings: LT01-LT32
  /^LT[0-9]{2}$/,
  // Programmable counter timers: PCT01-PCT32 and their PU/DO
  /^PCT[0-9]{2}$/,
  /^PCT[0-9]{2}(PU|DO|IN)$/,
  // Programmable logic timers (4-Series): PLT01-PLT32
  /^PLT[0-9]{2}$/,
  /^PLT[0-9]{2}(PU|DO|IN)$/,
  // Math variables (4-Series): MV01-MV32
  /^MV[0-9]{2}$/,
  // Setting group select equations: SS1-SS6
  /^SS[1-6]$/,
  // Pushbutton labels and LED control
  /^PB[0-9]{1,2}_LBL$/,
  /^PB[0-9]{1,2}A_LED$/,
  // Reclosing logic settings
  /^79.*/,
  // Torque control equations (logic expression that enables an element)
  /^[0-9]{2}[A-Z][0-9]?TC$/,
  // Block conditions commonly defined in logic
  /^BLOCK_.*/,
  // Custom user-defined logic variables with underscores (RST_xxx, BLK_xxx, etc.)
  /^RST_/,
  /^BLK_/,
];

// ─── Element Settings (Group Settings) ───────────────────────────────────────
// Protection element parameters: pickups, time dials, curves, delays, enables.
// Named using ANSI device number conventions: [DeviceNum][Type][Level][Param]

const ELEMENT_PATTERNS: RegExp[] = [
  // Overcurrent element pickups/settings: 50P1P, 50G2P, 50Q1P, 50N1P, 50BF1P
  /^50[A-Z]{0,2}[0-9]?[A-Z]?[PD]$/,
  /^50[A-Z]{0,2}[0-9]P$/,
  // Time-overcurrent: 51P1P, 51P1C, 51P1TD, 51P1RS, 51P1CT, 51P1MR, 51G1P, 51N1P, 51Q1P
  /^51[A-Z][0-9](P|C|TD|RS|CT|MR)$/,
  /^51[A-Z]{1,2}[0-9]?(P|C|TD|RS|CT|MR)$/,
  // Distance elements: Z1MAG, Z1ANG, Z1P, Z2P, Z1G, Z2G, Z2PD, Z3GD
  /^Z[0-9](MAG|ANG|P|G|PD|GD|R|X)$/,
  // Directional element settings: 67P1P, 67G1P, 67Q1P
  /^67[A-Z][0-9]?P$/,
  // Undervoltage: 27P1P, 27P1D, 27PP1P
  /^27[A-Z]{1,2}[0-9]?[PD]$/,
  // Overvoltage: 59P1P, 59P1D, 59G1P, 59Q1P, 59N1P
  /^59[A-Z]{1,2}[0-9]?[PD]$/,
  // Frequency: 81D1TP, 81D1TD, 81D1TC, 81R1TP, 81R1TD
  /^81[DR][0-9](TP|TD|TC|DO|TRND)$/,
  // Differential: O87P, SLP1, SLP2, PCT2, PCT5
  /^O87P$/,
  /^SLP[0-9]$/,
  // Enable flags: E50P, E51P, E27, E59, E67, E81D, E81R, ETEFP etc.
  /^E[0-9]{2}[A-Z]?$/,
  /^E[A-Z]{2,}$/,
  // Curve settings as standalone (U1-U5, C1-C5, etc. — these appear as values, not names)
  // Reclosing element parameters: 79OI (open interval), 79DT (dead time), etc.
  /^79(OI|DT|RS|RSD|SHC)[0-9]?$/,
  // Current and voltage supervision for frequency: 81RVSUP, 81RISUP
  /^81R[VI]SUP$/,
  // Breaker failure timing: BFTD, BFD
  /^BF[TD]D?$/,
  // General numeric timer/delay settings
  /^TGR$/,
  // Load encroachment: ELCR, ZLCR, PLCR
  /^[A-Z]LCR$/,
];

// ─── Global Settings ─────────────────────────────────────────────────────────
// System-wide parameters that apply regardless of active setting group.
// CT/PT ratios, nominal values, identifiers, port configuration.

const GLOBAL_EXACT = new Set([
  // CT/PT ratios
  'CTR', 'CTRN', 'CTR1', 'CTR2', 'CTR3', 'CTR4', 'CTR5',
  'PTR', 'PTRS', 'PTR1', 'PTR2',
  // Nominal values
  'NFREQ', 'FNOM', 'VNOM', 'INOM',
  // System configuration
  'DELTA_Y', 'SINGLEV', 'LEA_R',
  // Relay identification
  'RID', 'TID', 'BID',
  // Date/time
  'DATE_F', 'TZONE',
  // Demand metering
  'DMINT', 'DMPER',
  // IEC 61850 / GOOSE
  'GOOSE', 'GCBREF', 'DATSET',
]);

const GLOBAL_PATTERNS: RegExp[] = [
  // Port settings: BAUD1, BAUD2, BITS1, PAR1, STOP1, PROTO1
  /^(BAUD|BITS|PAR|STOP|PROTO)[0-9]$/,
  // Port enable: EPORT1, EPORT2
  /^EPORT[0-9]$/,
  // DNP/Modbus addresses
  /^(DNP|MB|IEC)_/,
  // Front panel settings
  /^FP_/,
  // Password settings
  /^PASS[0-9]$/,
  // Analog output scaling
  /^AO[0-9]/,
];

// ─── Classify a setting by name + value ──────────────────────────────────────

export function classifySetting(name: string, value: string): SettingCategory {
  const n = name.toUpperCase();

  // 1. Exact-match logic names
  if (LOGIC_EXACT.has(n)) return 'logic';

  // 2. Pattern-match logic names
  for (const re of LOGIC_PATTERNS) {
    if (re.test(n)) return 'logic';
  }

  // 3. Exact-match global names
  if (GLOBAL_EXACT.has(n)) return 'global';

  // 4. Pattern-match global names
  for (const re of GLOBAL_PATTERNS) {
    if (re.test(n)) return 'global';
  }

  // 5. Pattern-match element names
  for (const re of ELEMENT_PATTERNS) {
    if (re.test(n)) return 'element';
  }

  // 6. Value-based heuristics for remaining settings
  const trimVal = value.trim();

  // Pure numeric values (pickups, ratios, time dials) — check context
  if (/^\s*[\d.]+\s*$/.test(trimVal)) {
    // If name looks like a protection element parameter, it's element
    if (/^[0-9]{2}[A-Z]/.test(n)) return 'element';
    // Otherwise likely global (CTR-like) or element
    return 'global';
  }

  // Y/N enable flags are typically element settings
  if (/^[YN]$/i.test(trimVal)) {
    if (/^E[0-9A-Z]/.test(n)) return 'element';
    return 'global';
  }

  // Curve names (U1-U5, C1-C5, I1-I5) are element settings
  if (/^[UCILR][0-9]$/i.test(trimVal)) return 'element';

  // Contains logic operators → logic equation
  if (/[+*!()/]|AND|OR|NOT|R_|F_/i.test(trimVal)) return 'logic';

  // Single identifier (alias/reference) in value → logic
  if (/^[A-Z0-9_]+$/i.test(trimVal)) return 'logic';

  // Text labels (descriptions with spaces) → global
  if (/\s/.test(trimVal)) return 'global';

  // Default: treat as element
  return 'element';
}
