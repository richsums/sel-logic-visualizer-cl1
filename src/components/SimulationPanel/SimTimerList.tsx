import React from 'react';
import type { IRNode } from '../../core/ir/types';
import type { SimState } from '../../core/simulation/engine';
import styles from './SimulationPanel.module.css';

interface Props {
  nodes: IRNode[];
  simState: SimState;
}

const STATE_COLORS: Record<string, string> = {
  idle: '#4b5563',
  timing: '#3b82f6',
  qualified: '#22c55e',
  reset: '#ef4444',
};

export function SimTimerList({ nodes, simState }: Props) {
  if (nodes.length === 0) {
    return <div className={styles.emptyList}>No timers in this logic</div>;
  }

  return (
    <div className={styles.section}>
      <div className={styles.nodeList}>
        {nodes.map(node => {
          const info = simState.timerInfo.get(node.id);
          const state = info?.state ?? 'idle';
          const current = info?.currentTicks ?? 0;
          const threshold = info?.thresholdTicks ?? 0;
          const fraction = threshold > 0 ? Math.min(current / threshold, 1) : 0;
          const color = STATE_COLORS[state] ?? '#4b5563';
          const stateLabel = state === 'qualified' ? 'QUAL' : state.toUpperCase();

          return (
            <div key={node.id} className={`${styles.nodeRow} ${state === 'qualified' ? styles.nodeActive : ''}`}>
              <div className={styles.timerRow}>
                <span className={styles.nodeId}>{node.id}</span>
                <span className={styles.timerState} style={{ color }}>
                  {stateLabel}
                </span>
              </div>
              <div className={styles.timerBarRow}>
                <div className={styles.timerBar}>
                  <div
                    className={styles.timerFill}
                    style={{ width: `${fraction * 100}%`, background: color }}
                  />
                </div>
                <span className={styles.timerCount} style={{ color }}>
                  {current}/{threshold}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
