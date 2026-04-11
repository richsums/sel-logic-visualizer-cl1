import React, { useState } from 'react';
import type { IRNode } from '../../core/ir/types';
import type { SimState } from '../../core/simulation/engine';
import { groupInputs, INPUT_GROUP_LABELS, type InputGroup } from './simCategories';
import styles from './SimulationPanel.module.css';

interface Props {
  nodes: IRNode[];
  simState: SimState;
  filter: string;
  onFilterChange: (v: string) => void;
  onToggle: (nodeId: string) => void;
}

export function SimInputList({ nodes, simState, filter, onFilterChange, onToggle }: Props) {
  const [collapsed, setCollapsed] = useState<Set<InputGroup>>(new Set());

  const filtered = filter
    ? nodes.filter(n => n.id.toLowerCase().includes(filter.toLowerCase()))
    : nodes;

  const groups = groupInputs(filtered);

  function toggleGroup(group: InputGroup) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group); else next.add(group);
      return next;
    });
  }

  return (
    <div className={styles.section}>
      <input
        type="text"
        className={styles.searchInput}
        placeholder="Filter inputs..."
        value={filter}
        onChange={e => onFilterChange(e.target.value)}
      />
      {[...groups.entries()].map(([group, groupNodes]) => (
        <div key={group} className={styles.group}>
          <button className={styles.groupHeader} onClick={() => toggleGroup(group)}>
            <span className={styles.groupChevron}>
              {collapsed.has(group) ? '\u25B6' : '\u25BC'}
            </span>
            <span className={styles.groupLabel}>
              {INPUT_GROUP_LABELS[group]}
            </span>
            <span className={styles.groupCount}>{groupNodes.length}</span>
          </button>
          {!collapsed.has(group) && (
            <div className={styles.nodeList}>
              {groupNodes.map(node => {
                const active = simState.signals.get(node.id) ?? false;
                const forced = simState.forcedInputs.has(node.id);
                return (
                  <button
                    key={node.id}
                    className={`${styles.nodeBtn} ${active ? styles.nodeActive : ''}`}
                    onClick={() => onToggle(node.id)}
                    title={`Click to toggle ${node.id}`}
                  >
                    <span className={styles.nodeId}>
                      {forced && <span className={styles.forcedBadge}>F</span>}
                      {node.id}
                    </span>
                    <span className={`${styles.nodeState} ${active ? styles.stateOn : styles.stateOff}`}>
                      {active ? '1' : '0'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
      {groups.size === 0 && (
        <div className={styles.emptyList}>No inputs match filter</div>
      )}
    </div>
  );
}
