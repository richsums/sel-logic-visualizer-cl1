// ─── SEL Element Enable Settings Map ────────────────────────────────────────
// Maps enable setting names (E50P, E51S, etc.) to the regex patterns of
// protection element word bits they control. When the enable setting is
// "N", "OFF", or "0", all matching word bits are considered disabled and
// should be pruned from the logic graph.

export interface EnableRule {
  /** Regex matching the word bits this enable controls */
  pattern: RegExp;
  /** Human-readable description */
  desc: string;
}

/**
 * Static mapping of enable setting → controlled word bit patterns.
 * Covers SEL 3-Series, 4-Series, and 7-Series relays.
 */
export const ENABLE_MAP: Record<string, EnableRule> = {
  // ─── Overcurrent ──────────────────────────────────────────────────────
  E50P:  { pattern: /^50P[0-9]/,               desc: 'Phase instantaneous OC' },
  E50G:  { pattern: /^50G[0-9]/,               desc: 'Ground instantaneous OC' },
  E50Q:  { pattern: /^50Q[0-9]/,               desc: 'Neg-seq instantaneous OC' },
  E50N:  { pattern: /^50N[0-9]/,               desc: 'Neutral instantaneous OC' },
  E51S:  { pattern: /^51P[0-9]/,               desc: 'Phase time-OC' },
  E51P:  { pattern: /^51P[0-9]/,               desc: 'Phase time-OC (alt)' },
  E51G:  { pattern: /^51G[0-9]/,               desc: 'Ground time-OC' },
  E51Q:  { pattern: /^51Q[0-9]/,               desc: 'Neg-seq time-OC' },
  E51N:  { pattern: /^51N[0-9]/,               desc: 'Neutral time-OC' },

  // ─── Voltage ──────────────────────────────────────────────────────────
  E27:   { pattern: /^27P?[0-9]/,              desc: 'Phase undervoltage' },
  E27P:  { pattern: /^27P[0-9]/,               desc: 'Phase undervoltage' },
  E27S:  { pattern: /^27S[0-9]/,               desc: 'Pos-seq undervoltage' },
  E27PP: { pattern: /^27PP[0-9]/,              desc: 'Phase-to-phase UV' },
  E59:   { pattern: /^59P?[0-9]/,              desc: 'Phase overvoltage' },
  E59P:  { pattern: /^59P[0-9]/,               desc: 'Phase overvoltage' },
  E59G:  { pattern: /^59[GN][0-9]/,            desc: 'Ground/neutral OV' },
  E59N:  { pattern: /^59N[0-9]/,               desc: 'Neutral OV' },
  E59Q:  { pattern: /^59Q[0-9]/,               desc: 'Neg-seq OV' },
  E47:   { pattern: /^47/,                     desc: 'Neg-seq voltage' },

  // ─── Frequency ────────────────────────────────────────────────────────
  E81D:  { pattern: /^81D[0-9]/,               desc: 'Underfrequency' },
  E81R:  { pattern: /^81R[0-9]/,               desc: 'Rate-of-change freq' },

  // ─── Distance ─────────────────────────────────────────────────────────
  EZIP:  { pattern: /^Z[0-9]P/,               desc: 'Phase distance' },
  EZIG:  { pattern: /^Z[0-9]G/,               desc: 'Ground distance' },

  // ─── Directional ──────────────────────────────────────────────────────
  E67P:  { pattern: /^67P[0-9]/,               desc: 'Phase directional OC' },
  E67G:  { pattern: /^67G[0-9]/,               desc: 'Ground directional OC' },
  E67Q:  { pattern: /^67Q[0-9]/,               desc: 'Neg-seq directional OC' },
  E32:   { pattern: /^32[PQ][FR]/,             desc: 'Directional power' },

  // ─── Differential ─────────────────────────────────────────────────────
  E87:   { pattern: /^87[RUG]/,                desc: 'Differential' },
  E87P:  { pattern: /^87[RU][ABC]?$/,          desc: 'Phase differential' },
  E87G:  { pattern: /^87G[RU]/,                desc: 'Ground differential' },
  E87Q:  { pattern: /^87Q[RU]/,                desc: 'Neg-seq differential' },

  // ─── Breaker failure ──────────────────────────────────────────────────
  E50BF: { pattern: /^50BF/,                   desc: 'BF OC supervision' },
  EBFP:  { pattern: /^(BFT|BFI|BF$|86BF)/,    desc: 'Breaker failure scheme' },
  EBF:   { pattern: /^(BFT|BFI|BF$|86BF)/,    desc: 'Breaker failure scheme' },

  // ─── Reclosing ────────────────────────────────────────────────────────
  E79:   { pattern: /^79/,                     desc: 'Autoreclosing' },

  // ─── Thermal ──────────────────────────────────────────────────────────
  ETEF:  { pattern: /^49[TA]/,                 desc: 'Thermal element' },
  ETEFP: { pattern: /^49[TA]/,                 desc: 'Thermal element' },

  // ─── Other ────────────────────────────────────────────────────────────
  ELOP:  { pattern: /^LOP/,                    desc: 'Loss of potential' },
  ELOAD: { pattern: /^LOAD/,                   desc: 'Load encroachment' },
  E46:   { pattern: /^46/,                     desc: 'Current unbalance' },
  E25:   { pattern: /^25/,                     desc: 'Synchrocheck' },
  EOOS:  { pattern: /^(OST|OSB)/,              desc: 'Out-of-step' },
  E24:   { pattern: /^24/,                     desc: 'V/Hz overexcitation' },
  E50HS: { pattern: /^50HS/,                   desc: 'High-speed OC' },
};

/**
 * Collect the regex patterns for all disabled enable flags in the settings.
 * Returns the patterns so callers can test any node ID, not just settings names.
 */
export function getDisabledPatterns(
  settings: { name: string; value: string }[]
): RegExp[] {
  const patterns: RegExp[] = [];
  for (const s of settings) {
    const val = s.value.trim().toUpperCase();
    const key = s.name.toUpperCase();
    if (ENABLE_MAP[key] && (val === 'N' || val === 'OFF' || val === '0')) {
      patterns.push(ENABLE_MAP[key].pattern);
    }
  }
  return patterns;
}

/**
 * Test if a node ID is disabled by any of the given patterns.
 */
export function isDisabledByPatterns(id: string, patterns: RegExp[]): boolean {
  const upper = id.toUpperCase();
  return patterns.some(p => p.test(upper));
}

/**
 * Given the full settings list, compute the set of disabled word bit node IDs.
 * Checks enable flags (E-settings) and also dead logic equations (value = "0", "NA", "").
 */
export function computeDisabledNodes(
  settings: { name: string; value: string; category: string }[]
): { disabled: Set<string>; disabledPatterns: RegExp[] } {
  const disabled = new Set<string>();
  const disabledPatterns = getDisabledPatterns(settings);

  // For each setting, check if its name matches a disabled enable pattern
  // Also check if the equation itself is dead (value = "0", "NA", or empty)
  for (const s of settings) {
    const name = s.name.toUpperCase();
    const val = s.value.trim().toUpperCase();

    // Check if this node's name matches any disabled enable pattern
    if (isDisabledByPatterns(name, disabledPatterns)) {
      disabled.add(name);
    }

    // Dead logic equations: value is "0", "NA", or empty — the output/derived node never asserts
    if (s.category === 'logic') {
      if (val === '0' || val === 'NA' || val === '') {
        disabled.add(name);
      }
    }
  }

  return { disabled, disabledPatterns };
}
