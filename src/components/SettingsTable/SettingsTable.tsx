import React, { useState, useMemo } from 'react';
import { useAppStore } from '../../store/appStore';
import type { SettingCategory } from '../../core/importer/types';
import styles from './SettingsTable.module.css';

const TABS: { key: SettingCategory | 'all'; label: string; desc: string }[] = [
  { key: 'all',     label: 'All',     desc: 'All settings' },
  { key: 'element', label: 'Element', desc: 'Protection element parameters (pickups, curves, time dials, enables)' },
  { key: 'logic',   label: 'Logic',   desc: 'SELOGIC control equations (TR, CL, OUTxxx, SVxx, latches)' },
  { key: 'global',  label: 'Global',  desc: 'System-wide parameters (CTR, PTR, NFREQ, port config)' },
];

export function SettingsTable() {
  const { docA } = useAppStore();
  const [filter, setFilter] = useState('');
  const [activeTab, setActiveTab] = useState<SettingCategory | 'all'>('all');

  if (!docA) return <div className={styles.empty}>No settings loaded.</div>;

  const counts = useMemo(() => {
    const c = { all: 0, element: 0, logic: 0, global: 0 };
    for (const s of docA.settings) {
      c.all++;
      c[s.category]++;
    }
    return c;
  }, [docA]);

  const filtered = useMemo(() => {
    return docA.settings.filter(s => {
      if (activeTab !== 'all' && s.category !== activeTab) return false;
      if (filter) {
        const f = filter.toLowerCase();
        return s.name.toLowerCase().includes(f) || s.value.toLowerCase().includes(f);
      }
      return true;
    });
  }, [docA, activeTab, filter]);

  const activeDesc = TABS.find(t => t.key === activeTab)?.desc ?? '';

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Parsed Settings ({counts.all})</h3>
        <input
          className={styles.filter}
          placeholder="Filter by name or value..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
      </div>
      <div className={styles.tabs}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            className={`${styles.tab} ${activeTab === tab.key ? styles.tabActive : ''} ${styles['tab_' + tab.key]}`}
            onClick={() => setActiveTab(tab.key)}
            title={tab.desc}
          >
            {tab.label}
            <span className={styles.tabCount}>{counts[tab.key]}</span>
          </button>
        ))}
      </div>
      <div className={styles.tabDesc}>{activeDesc}</div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Line</th>
              <th>Name</th>
              <th>Value</th>
              <th>Category</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.name}>
                <td className={styles.lineNum}>{s.rawLine.index + 1}</td>
                <td className={styles.name}>{s.name}</td>
                <td className={styles.value}>{s.value}</td>
                <td className={styles.kind}>
                  <span className={`${styles.badge} ${styles['b_' + s.category]}`}>
                    {s.category}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className={styles.empty}>No settings match this filter.</div>
        )}
      </div>
    </div>
  );
}
