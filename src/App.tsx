import React from 'react';
import { useAppStore, type AppPanel } from './store/appStore';
import { ImportPanel } from './components/ImportPanel/ImportPanel';
import { GraphView } from './components/GraphView/GraphView';
import { AnalysisSidebar } from './components/AnalysisSidebar/AnalysisSidebar';
import { SimulationPanel } from './components/SimulationPanel/SimulationPanel';
import { DiagnosticsPanel } from './components/DiagnosticsPanel/DiagnosticsPanel';
import { ComparisonView } from './components/ComparisonView/ComparisonView';
import { TutorialPanel } from './components/TutorialPanel/TutorialPanel';
import { ExportPanel } from './components/ExportPanel/ExportPanel';
import { SettingsTable } from './components/SettingsTable/SettingsTable';
import styles from './App.module.css';

interface NavItem {
  id: AppPanel;
  label: string;
  short: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'import',      label: 'Import',      short: 'IMP' },
  { id: 'graph',       label: 'Graph',       short: 'GRF' },
  { id: 'analysis',    label: 'Analysis',    short: 'ANL' },
  { id: 'simulation',  label: 'Simulation',  short: 'SIM' },
  { id: 'settings',    label: 'Settings',    short: 'SET' },
  { id: 'diagnostics', label: 'Diagnostics', short: 'DGN' },
  { id: 'comparison',  label: 'Compare',     short: 'CMP' },
  { id: 'export',      label: 'Export',      short: 'EXP' },
  { id: 'tutorial',    label: 'Help',        short: 'HLP' },
];

function PanelContent({ panel }: { panel: AppPanel }) {
  switch (panel) {
    case 'import':      return <ImportPanel />;
    case 'graph':       return <GraphView />;
    case 'analysis':    return <AnalysisSidebar />;
    case 'simulation':  return <SimulationPanel />;
    case 'settings':    return <SettingsTable />;
    case 'diagnostics': return <DiagnosticsPanel />;
    case 'comparison':  return <ComparisonView />;
    case 'export':      return <ExportPanel />;
    case 'tutorial':    return <TutorialPanel />;
    default:            return null;
  }
}

export function App() {
  const { activePanel, setActivePanel, docA, graph } = useAppStore();
  const hasDoc = !!docA;

  return (
    <div className={styles.root}>
      {/* Top bar */}
      <header className={styles.topbar}>
        <div className={styles.logoArea}>
          <span className={styles.logoMark}>SEL</span>
          <span className={styles.logoText}>Logic Visualizer</span>
        </div>
        {hasDoc && (
          <div className={styles.docInfo}>
            <span className={styles.docLabel}>{docA!.label}</span>
            <span className={styles.docMeta}>
              {docA!.settings.length} settings · {graph?.nodes.size ?? 0} nodes
            </span>
          </div>
        )}
      </header>

      <div className={styles.body}>
        {/* Side nav */}
        <nav className={styles.nav}>
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              className={`${styles.navBtn} ${activePanel === item.id ? styles.navActive : ''}`}
              onClick={() => setActivePanel(item.id)}
              title={item.label}
            >
              <span className={styles.navShort}>{item.short}</span>
              <span className={styles.navLabel}>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Main content */}
        <main className={styles.main}>
          {/* Graph always rendered behind other panels for performance */}
          {activePanel === 'graph' ? (
            <PanelContent panel="graph" />
          ) : (
            <PanelContent panel={activePanel} />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
