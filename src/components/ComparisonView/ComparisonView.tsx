import React, { useState } from 'react';
import { importSettings } from '../../core/importer/importer';
import { compareDocuments } from '../../core/comparison/engine';
import { useAppStore } from '../../store/appStore';
import styles from './ComparisonView.module.css';

export function ComparisonView() {
  const { docA, setDocB, setComparisonResult, comparisonResult } = useAppStore();
  const [textB, setTextB] = useState('');
  const [labelB, setLabelB] = useState('Revision B');

  function handleCompare() {
    if (!docA || !textB.trim()) return;
    const docB = importSettings(textB, labelB);
    setDocB(docB);
    setComparisonResult(compareDocuments(docA, docB));
  }

  if (!docA) {
    return <div className={styles.empty}>Import a base settings document first.</div>;
  }

  return (
    <div className={styles.panel}>
      <h3 className={styles.title}>Revision Comparison</h3>
      <p className={styles.desc}>
        <strong>{docA.label}</strong> is loaded as revision A. Paste revision B below.
      </p>

      <div className={styles.row}>
        <label className={styles.label}>Revision B label</label>
        <input
          className={styles.input}
          value={labelB}
          onChange={e => setLabelB(e.target.value)}
        />
      </div>

      <textarea
        className={styles.textarea}
        value={textB}
        onChange={e => setTextB(e.target.value)}
        placeholder="Paste revision B settings here…"
        spellCheck={false}
      />

      <button
        className={styles.compareBtn}
        onClick={handleCompare}
        disabled={!textB.trim()}
      >
        Compare
      </button>

      {comparisonResult && (
        <div className={styles.results}>
          <div className={styles.summary}>
            <span className={styles.added}>+{comparisonResult.addedSettings.length} added</span>
            <span className={styles.removed}>-{comparisonResult.removedSettings.length} removed</span>
            <span className={styles.changed}>~{comparisonResult.changedSettings.length} changed</span>
          </div>

          {comparisonResult.settingDiffs.length === 0 && (
            <div className={styles.noDiffs}>No differences found.</div>
          )}

          {comparisonResult.settingDiffs.map((diff, i) => (
            <div key={i} className={`${styles.diff} ${styles[diff.type]}`}>
              <div className={styles.diffHeader}>
                <span className={styles.diffType}>{diff.type.toUpperCase()}</span>
                <code className={styles.diffName}>{diff.name}</code>
              </div>
              {diff.oldValue && (
                <div className={styles.diffOld}>- {diff.oldValue}</div>
              )}
              {diff.newValue && (
                <div className={styles.diffNew}>+ {diff.newValue}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
