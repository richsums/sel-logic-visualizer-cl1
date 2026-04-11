import React from 'react';
import type { IRNode } from '../../core/ir/types';
import type { SimState } from '../../core/simulation/engine';
import styles from './SimulationPanel.module.css';

interface Props {
  nodes: IRNode[];
  simState: SimState;
}

export function SimLatchList({ nodes, simState }: Props) {
  if (nodes.length === 0) {
    return <div className={styles.emptyList}>No latches in this logic</div>;
  }

  return (
    <div className={styles.section}>
      <div className={styles.nodeList}>
        {nodes.map(node => {
          const latched = simState.latches.get(node.id) ?? false;
          const active = simState.signals.get(node.id) ?? false;

          return (
            <div
              key={node.id}
              className={`${styles.nodeRow} ${latched ? styles.nodeLatchActive : ''}`}
            >
              <span className={styles.nodeId}>
                {latched && <span className={styles.latchBadge}>L</span>}
                {node.id}
              </span>
              <span className={`${styles.nodeState} ${active ? styles.stateOn : styles.stateOff}`}>
                {active ? 'SET' : 'RST'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
