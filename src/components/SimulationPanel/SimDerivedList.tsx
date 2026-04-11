import React, { useState } from 'react';
import type { IRNode } from '../../core/ir/types';
import type { SimState } from '../../core/simulation/engine';
import styles from './SimulationPanel.module.css';

interface Props {
  nodes: IRNode[];
  simState: SimState;
}

export function SimDerivedList({ nodes, simState }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (nodes.length === 0) {
    return <div className={styles.emptyList}>No derived signals</div>;
  }

  // Sort: asserted first
  const sorted = [...nodes].sort((a, b) => {
    const aActive = simState.signals.get(a.id) ?? false;
    const bActive = simState.signals.get(b.id) ?? false;
    if (aActive !== bActive) return aActive ? -1 : 1;
    return a.id.localeCompare(b.id);
  });

  const assertedCount = sorted.filter(n => simState.signals.get(n.id) ?? false).length;
  const shown = expanded ? sorted : sorted.slice(0, 20);

  return (
    <div className={styles.section}>
      <div className={styles.sectionInfo}>
        <span className={styles.quietBanner}>
          {assertedCount} of {nodes.length} asserted
        </span>
      </div>
      <div className={styles.nodeList}>
        {shown.map(node => {
          const active = simState.signals.get(node.id) ?? false;
          return (
            <div key={node.id} className={`${styles.nodeRow} ${active ? styles.nodeActive : ''}`}>
              <span className={styles.nodeId}>{node.id}</span>
              <span className={`${styles.nodeState} ${active ? styles.stateOn : styles.stateOff}`}>
                {active ? '1' : '0'}
              </span>
            </div>
          );
        })}
      </div>
      {sorted.length > 20 && (
        <button className={styles.expandBtn} onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Show less' : `Show all ${sorted.length} signals`}
        </button>
      )}
    </div>
  );
}
