import React from 'react';
import type { IRNode } from '../../core/ir/types';
import type { SimState } from '../../core/simulation/engine';
import styles from './SimulationPanel.module.css';

const CLASS_LABELS: Record<string, { text: string; color: string }> = {
  trip: { text: 'TRIP', color: '#ef4444' },
  close: { text: 'CLOSE', color: '#3b82f6' },
  alarm: { text: 'ALARM', color: '#f59e0b' },
  breaker_failure: { text: 'BF', color: '#ef4444' },
  reclose: { text: 'RECLOSE', color: '#8b5cf6' },
  block: { text: 'BLOCK', color: '#6b7280' },
  display: { text: 'DISP', color: '#06b6d4' },
  led: { text: 'LED', color: '#22d3ee' },
  supervisory: { text: 'SUPV', color: '#a78bfa' },
  other: { text: 'OUT', color: '#9ca3af' },
};

interface Props {
  nodes: IRNode[];
  simState: SimState;
  focusedOutputId: string | null;
  onFocusOutput: (id: string | null) => void;
}

export function SimOutputList({ nodes, simState, focusedOutputId, onFocusOutput }: Props) {
  // Sort: asserted first, then by output class
  const sorted = [...nodes].sort((a, b) => {
    const aActive = simState.signals.get(a.id) ?? false;
    const bActive = simState.signals.get(b.id) ?? false;
    if (aActive !== bActive) return aActive ? -1 : 1;
    return a.id.localeCompare(b.id);
  });

  const assertedCount = sorted.filter(n => simState.signals.get(n.id) ?? false).length;

  return (
    <div className={styles.section}>
      <div className={styles.sectionInfo}>
        {assertedCount > 0 ? (
          <span className={styles.assertedBanner}>
            {assertedCount} output{assertedCount !== 1 ? 's' : ''} asserted
          </span>
        ) : (
          <span className={styles.quietBanner}>No outputs asserted</span>
        )}
      </div>
      <div className={styles.nodeList}>
        {sorted.map(node => {
          const active = simState.signals.get(node.id) ?? false;
          const changed = simState.changedOutputs.has(node.id);
          const isFocused = focusedOutputId === node.id;
          const classInfo = node.outputClass ? CLASS_LABELS[node.outputClass] : null;

          return (
            <button
              key={node.id}
              className={`${styles.nodeBtn} ${active ? styles.nodeOutputActive : ''} ${isFocused ? styles.nodeFocused : ''}`}
              onClick={() => onFocusOutput(isFocused ? null : node.id)}
              title={`Click to trace causal path for ${node.id}`}
            >
              <span className={styles.nodeId}>
                {classInfo && (
                  <span className={styles.classBadge} style={{ color: classInfo.color, borderColor: classInfo.color }}>
                    {classInfo.text}
                  </span>
                )}
                {node.id}
                {changed && <span className={styles.changedDot} />}
              </span>
              <span className={`${styles.nodeState} ${active ? styles.stateOn : styles.stateOff}`}>
                {active ? '1' : '0'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
