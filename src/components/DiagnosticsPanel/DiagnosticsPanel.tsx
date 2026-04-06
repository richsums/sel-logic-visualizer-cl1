import React from 'react';
import { useAppStore } from '../../store/appStore';
import styles from './DiagnosticsPanel.module.css';

export function DiagnosticsPanel() {
  const { docA } = useAppStore();

  if (!docA) return <div className={styles.empty}>No document loaded.</div>;

  const errors   = docA.diagnostics.filter(d => d.severity === 'error');
  const warnings = docA.diagnostics.filter(d => d.severity === 'warning');
  const infos    = docA.diagnostics.filter(d => d.severity === 'info');

  return (
    <div className={styles.panel}>
      <h3 className={styles.title}>Diagnostics</h3>

      <div className={styles.summary}>
        <span className={`${styles.badge} ${styles.error}`}>{errors.length} errors</span>
        <span className={`${styles.badge} ${styles.warning}`}>{warnings.length} warnings</span>
        <span className={`${styles.badge} ${styles.info}`}>{infos.length} info</span>
      </div>

      {docA.diagnostics.length === 0 && (
        <div className={styles.ok}>No diagnostics. Import looks clean.</div>
      )}

      {docA.diagnostics.map((d, i) => (
        <div key={i} className={`${styles.diag} ${styles[d.severity]}`}>
          <div className={styles.diagHeader}>
            <span className={styles.sev}>{d.severity.toUpperCase()}</span>
            {d.lineIndex !== undefined && (
              <span className={styles.lineRef}>Line {d.lineIndex + 1}</span>
            )}
          </div>
          <div className={styles.diagMsg}>{d.message}</div>
          {d.rawText && (
            <code className={styles.rawText}>{d.rawText}</code>
          )}
        </div>
      ))}

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Lines summary</div>
        {(['setting','header','blank','comment','unknown'] as const).map(kind => {
          const count = docA.lines.filter(l => l.kind === kind).length;
          return (
            <div key={kind} className={styles.row}>
              <span>{kind}</span>
              <span className={styles.count}>{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
