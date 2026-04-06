import React, { useState, useRef } from 'react';
import { importSettings } from '../../core/importer/importer';
import { buildIR } from '../../core/ir/irBuilder';
import { analyzeGraph } from '../../core/analysis/engine';
import { createSimState } from '../../core/simulation/engine';
import { useAppStore } from '../../store/appStore';
import { EXAMPLE_FEEDER_SETTINGS, EXAMPLE_CSV_SETTINGS, EXAMPLE_XFMR_SETTINGS } from '../../fixtures/exampleSettings';
import styles from './ImportPanel.module.css';

export function ImportPanel() {
  const [text, setText] = useState('');
  const [label, setLabel] = useState('Relay Settings');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { setDocA, setGraph, setAnalysisReport, setSimState, setActivePanel } = useAppStore();

  function handleVisualize() {
    if (!text.trim()) return;
    const doc = importSettings(text, label);
    setDocA(doc);
    const graph = buildIR(doc);
    setGraph(graph);
    const report = analyzeGraph(graph, doc);
    setAnalysisReport(report);
    setSimState(createSimState(graph));
    setActivePanel('graph');
  }

  function loadExample(ex: string, name: string) {
    setText(ex);
    setLabel(name);
  }

  function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Use filename (without extension) as the document label
    const name = file.name.replace(/\.[^.]+$/, '');
    setLabel(name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      if (content) setText(content);
    };
    reader.readAsText(file);
    // Reset input so the same file can be re-selected
    e.target.value = '';
  }

  const lineCount = text.split('\n').filter(l => l.trim()).length;

  return (
    <div className={styles.panel}>
      <h2 className={styles.title}>Import Settings</h2>
      <p className={styles.desc}>
        Paste raw QuickSet terminal output (<code>SHO SET</code>, <code>SHO SET L</code>,{' '}
        <code>SHO SET G</code>) or import a relay exported <code>.txt</code> settings file.
        No editing required.
      </p>

      <div className={styles.row}>
        <label className={styles.label}>Document label</label>
        <input
          className={styles.input}
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="e.g. Feeder 1A Rev 3"
        />
      </div>

      <div className={styles.examplesRow}>
        <span className={styles.exLabel}>Load example:</span>
        <button className={styles.exBtn} onClick={() => loadExample(EXAMPLE_FEEDER_SETTINGS, 'SEL-351 Feeder')}>
          SEL-351 Feeder
        </button>
        <button className={styles.exBtn} onClick={() => loadExample(EXAMPLE_CSV_SETTINGS, 'SEL-751 CSV')}>
          SEL-751 (.txt)
        </button>
        <button className={styles.exBtn} onClick={() => loadExample(EXAMPLE_XFMR_SETTINGS, 'SEL-387 Xfmr Diff')}>
          SEL-387 Xfmr
        </button>
      </div>

      <textarea
        className={styles.textarea}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={'Paste SHO SET output here…\n\nOr use "Import from .txt" to load a relay settings file directly.'}
        spellCheck={false}
      />

      <div className={styles.footer}>
        <span className={styles.charCount}>{lineCount} lines</span>
        <div className={styles.btnGroup}>
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.csv"
            style={{ display: 'none' }}
            onChange={handleFileImport}
          />
          <button
            className={styles.fileBtn}
            onClick={() => fileInputRef.current?.click()}
          >
            Import from .txt
          </button>
          <button
            className={styles.visualizeBtn}
            onClick={handleVisualize}
            disabled={!text.trim()}
          >
            Visualize
          </button>
        </div>
      </div>
    </div>
  );
}
