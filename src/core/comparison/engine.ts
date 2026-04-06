// ─── Revision comparison engine ───────────────────────────────────────────────
import type { ImportedSettingsDocument } from '../importer/types';

export interface SettingDiff {
  name: string;
  type: 'added' | 'removed' | 'changed';
  oldValue?: string;
  newValue?: string;
}

export interface ComparisonResult {
  settingDiffs: SettingDiff[];
  addedSettings: string[];
  removedSettings: string[];
  changedSettings: SettingDiff[];
}

export function compareDocuments(
  docA: ImportedSettingsDocument,
  docB: ImportedSettingsDocument
): ComparisonResult {
  const mapA = new Map(docA.settings.map(s => [s.name, s.value]));
  const mapB = new Map(docB.settings.map(s => [s.name, s.value]));

  const settingDiffs: SettingDiff[] = [];
  const addedSettings: string[] = [];
  const removedSettings: string[] = [];
  const changedSettings: SettingDiff[] = [];

  // Added in B
  for (const [name, value] of mapB) {
    if (!mapA.has(name)) {
      const diff: SettingDiff = { name, type: 'added', newValue: value };
      settingDiffs.push(diff);
      addedSettings.push(name);
    }
  }

  // Removed from A
  for (const [name, value] of mapA) {
    if (!mapB.has(name)) {
      const diff: SettingDiff = { name, type: 'removed', oldValue: value };
      settingDiffs.push(diff);
      removedSettings.push(name);
    }
  }

  // Changed
  for (const [name, oldValue] of mapA) {
    const newValue = mapB.get(name);
    if (newValue !== undefined && newValue !== oldValue) {
      const diff: SettingDiff = { name, type: 'changed', oldValue, newValue };
      settingDiffs.push(diff);
      changedSettings.push(diff);
    }
  }

  return { settingDiffs, addedSettings, removedSettings, changedSettings };
}
