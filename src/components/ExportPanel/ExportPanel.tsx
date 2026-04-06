import React, { useRef } from 'react';
import { useAppStore } from '../../store/appStore';
import styles from './ExportPanel.module.css';

export function ExportPanel() {
  const { docA, graph, analysisReport } = useAppStore();

  function exportSettingsCSV() {
    if (!docA) return;
    const rows = docA.settings.map(s => `${s.name},${JSON.stringify(s.value)}`);
    const csv = ['Name,Value', ...rows].join('\n');
    download(`${docA.label}_settings.csv`, csv, 'text/csv');
  }

  function exportDiagnostics() {
    if (!docA) return;
    const lines = docA.diagnostics.map(d =>
      `[${d.severity.toUpperCase()}] ${d.lineIndex !== undefined ? `Line ${d.lineIndex + 1}: ` : ''}${d.message}${d.rawText ? `\n  > ${d.rawText}` : ''}`
    );
    download(`${docA.label}_diagnostics.txt`, lines.join('\n'), 'text/plain');
  }

  function exportAnalysis() {
    if (!docA || !graph || !analysisReport) return;
    const lines: string[] = [
      `=== SEL Logic Visualizer - Analysis Report ===`,
      `Document: ${docA.label}`,
      ``,
      `Settings: ${docA.settings.length}`,
      `Element settings: ${graph.elementSettingNames.length}`,
      `Logic settings: ${graph.logicSettingNames.length}`,
      `Global settings: ${graph.globalSettingNames.length}`,
      `Graph nodes: ${graph.nodes.size}`,
      `Graph edges: ${graph.edges.length}`,
      ``,
      `--- Cycles (${analysisReport.cycles.length}) ---`,
      ...analysisReport.cycles.map(c => c.join(' → ') + ' → (cycle)'),
      ``,
      `--- Undefined references (${analysisReport.undefinedIdents.length}) ---`,
      ...analysisReport.undefinedIdents,
      ``,
      `--- Unused settings (${analysisReport.unusedNodes.length}) ---`,
      ...analysisReport.unusedNodes,
      ``,
      `--- Logic settings ---`,
      ...graph.logicSettingNames.map(n => {
        const node = graph.nodes.get(n);
        return `${n} = ${node?.sourceRawValue ?? '?'}`;
      }),
    ];
    download(`${docA.label}_analysis.txt`, lines.join('\n'), 'text/plain');
  }

  function download(filename: string, content: string, mime: string) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: mime }));
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (!docA) return <div className={styles.empty}>Import settings to enable exports.</div>;

  return (
    <div className={styles.panel}>
      <h3 className={styles.title}>Export</h3>

      <div className={styles.group}>
        <div className={styles.groupTitle}>Settings</div>
        <button className={styles.btn} onClick={exportSettingsCSV}>
          Export settings as CSV
        </button>
        <p className={styles.desc}>All parsed name/value pairs as a spreadsheet-ready CSV file.</p>
      </div>

      <div className={styles.group}>
        <div className={styles.groupTitle}>Analysis</div>
        <button className={styles.btn} onClick={exportAnalysis} disabled={!analysisReport}>
          Export analysis report
        </button>
        <p className={styles.desc}>Logic summary, cycles, undefined references, and unused settings.</p>
      </div>

      <div className={styles.group}>
        <div className={styles.groupTitle}>Diagnostics</div>
        <button className={styles.btn} onClick={exportDiagnostics}>
          Export diagnostics
        </button>
        <p className={styles.desc}>Import warnings and parse errors for this settings document.</p>
      </div>

      <div className={styles.group}>
        <div className={styles.groupTitle}>Graph image</div>
        <p className={styles.desc}>
          To export the graph as an image, right-click the graph and use your browser's
          "Save image" option, or use the browser's print-to-PDF feature on the graph view.
        </p>
      </div>
    </div>
  );
}
