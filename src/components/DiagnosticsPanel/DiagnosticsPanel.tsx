import React, { useMemo } from 'react';
import { useAppStore } from '../../store/appStore';
import { computeUnusedSettings, type UnusedGroup } from '../../core/analysis/engine';
import { partitionGraph } from '../../core/partition/engine';
import styles from './DiagnosticsPanel.module.css';

const UNUSED_GROUP_TITLE: Record<UnusedGroup, string> = {
  output: 'Output contacts with no logic',
  variable: 'Variables / latches not feeding an output',
  signal: 'Elements / signals not used in logic',
};

export function DiagnosticsPanel() {
  const { docA, graph } = useAppStore();

  const unused = useMemo(() => {
    if (!graph) return [];
    const { usedLogicalIds } = partitionGraph(graph);
    return computeUnusedSettings(graph, usedLogicalIds);
  }, [graph]);

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
        <div className={styles.sectionTitle}>Unused in logic ({unused.length})</div>
        {unused.length === 0 ? (
          <div className={styles.row}><span>All defined elements are used in the logic.</span></div>
        ) : (
          (['output', 'variable', 'signal'] as const).map(group => {
            const items = unused.filter(u => u.group === group);
            if (items.length === 0) return null;
            return (
              <div key={group} style={{ marginBottom: 8 }}>
                <div className={styles.row} style={{ opacity: 0.7, fontSize: 11, marginTop: 4 }}>
                  <span>{UNUSED_GROUP_TITLE[group]}</span>
                  <span className={styles.count}>{items.length}</span>
                </div>
                {items.map(u => (
                  <div key={u.id} className={styles.row} title={u.reason}>
                    <span style={{ fontFamily: 'monospace' }}>{u.label}</span>
                    <span className={styles.count} style={{ fontSize: 10, opacity: 0.7 }}>{u.reason}</span>
                  </div>
                ))}
              </div>
            );
          })
        )}
      </div>

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
