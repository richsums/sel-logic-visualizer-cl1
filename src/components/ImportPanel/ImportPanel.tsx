import React, { useState, useRef, useCallback } from 'react';
import { importSettings, importAndMerge } from '../../core/importer/importer';
import { buildIR } from '../../core/ir/irBuilder';
import { analyzeGraph } from '../../core/analysis/engine';
import { createSimState } from '../../core/simulation/engine';
import { useAppStore } from '../../store/appStore';
import { EXAMPLE_FEEDER_SETTINGS, EXAMPLE_CSV_SETTINGS, EXAMPLE_XFMR_SETTINGS } from '../../fixtures/exampleSettings';
import styles from './ImportPanel.module.css';

// Strip non-printable control characters that SEL relay files may contain
function sanitizeText(raw: string): string {
  return raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').replace(/\r\n?/g, '\n');
}

type ImportMode = 'single' | 'multi';

interface FileSlot {
  label: string;
  hint: string;
  defaultFilename: string;
  text: string;
  fileName: string;
}

const INITIAL_SLOTS: FileSlot[] = [
  { label: 'Element Settings', hint: 'Set_1 — Protection element parameters, enable flags, pickups, time dials', defaultFilename: 'Set_1', text: '', fileName: '' },
  { label: 'Logic Settings', hint: 'Set_L1 — SELOGIC control equations (TR, OUT, SV, etc.)', defaultFilename: 'Set_L1', text: '', fileName: '' },
  { label: 'Global Settings', hint: 'Set_G — CT/PT ratios, relay ID, port configuration', defaultFilename: 'Set_G', text: '', fileName: '' },
];

export function ImportPanel() {
  const [mode, setMode] = useState<ImportMode>('multi');
  const [singleText, setSingleText] = useState('');
  const [slots, setSlots] = useState<FileSlot[]>(INITIAL_SLOTS.map(s => ({ ...s })));
  const [label, setLabel] = useState('Relay Settings');
  const singleFileRef = useRef<HTMLInputElement>(null);
  const multiFileRefs = useRef<(HTMLInputElement | null)[]>([null, null, null]);
  const { setDocA, setGraph, setAnalysisReport, setSimState, setActivePanel } = useAppStore();

  // ─── Single-file / paste mode ─────────────────────────────────────────
  function handleVisualizeSingle() {
    if (!singleText.trim()) return;
    const doc = importSettings(singleText, label);
    finalize(doc);
  }

  // ─── Multi-file mode ──────────────────────────────────────────────────
  function handleVisualizeMulti() {
    const files = slots
      .filter(s => s.text.trim())
      .map(s => ({ text: s.text, fileLabel: s.label }));
    if (files.length === 0) return;
    const doc = importAndMerge(files, label);
    finalize(doc);
  }

  function finalize(doc: ReturnType<typeof importSettings>) {
    setDocA(doc);
    const graph = buildIR(doc);
    setGraph(graph);
    const report = analyzeGraph(graph, doc);
    setAnalysisReport(report);
    setSimState(createSimState(graph));
    setActivePanel('graph');
  }

  // ─── File handlers ────────────────────────────────────────────────────
  function handleSingleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLabel(file.name.replace(/\.[^.]+$/, ''));
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      if (content) setSingleText(sanitizeText(content));
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function handleMultiFile(slotIndex: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      if (content) {
        setSlots(prev => prev.map((s, i) =>
          i === slotIndex ? { ...s, text: sanitizeText(content), fileName: file.name } : s
        ));
      }
    };
    reader.readAsText(file);
    e.target.value = '';

    // Auto-detect label from first uploaded file
    if (!slots.some(s => s.fileName)) {
      const baseName = file.name.replace(/\.[^.]+$/, '').replace(/^Set_[LG]?[0-9]?_?/i, '');
      if (baseName) setLabel(baseName);
    }
  }

  function handleMultiDrop(slotIndex: number, files: FileList) {
    const file = files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      if (content) {
        setSlots(prev => prev.map((s, i) =>
          i === slotIndex ? { ...s, text: sanitizeText(content), fileName: file.name } : s
        ));
      }
    };
    reader.readAsText(file);
  }

  function clearSlot(index: number) {
    setSlots(prev => prev.map((s, i) =>
      i === index ? { ...s, text: '', fileName: '' } : s
    ));
  }

  function loadExample(ex: string, name: string) {
    setMode('single');
    setSingleText(ex);
    setLabel(name);
  }

  // ─── Auto-assign files dropped at once ────────────────────────────────
  function handleBulkDrop(e: React.DragEvent) {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    for (const file of files) {
      const fn = file.name.toUpperCase();
      let slotIdx = -1;
      if (fn.includes('SET_1') && !fn.includes('SET_L')) slotIdx = 0;        // Element
      else if (fn.includes('SET_L')) slotIdx = 1;                              // Logic
      else if (fn.includes('SET_G')) slotIdx = 2;                              // Global
      else if (fn.includes('ELEMENT') || fn.includes('ELE')) slotIdx = 0;
      else if (fn.includes('LOGIC') || fn.includes('LOG')) slotIdx = 1;
      else if (fn.includes('GLOBAL') || fn.includes('GLO')) slotIdx = 2;

      if (slotIdx >= 0) {
        handleMultiDrop(slotIdx, createFileList(file));
      }
    }
  }

  // Helper to create a single-file FileList
  function createFileList(file: File): FileList {
    const dt = new DataTransfer();
    dt.items.add(file);
    return dt.files;
  }

  const multiLineCount = slots.reduce((sum, s) => sum + (s.text ? s.text.split('\n').filter(l => l.trim()).length : 0), 0);
  const multiFilesLoaded = slots.filter(s => s.text.trim()).length;
  const singleLineCount = singleText.split('\n').filter(l => l.trim()).length;

  return (
    <div className={styles.panel}>
      <h2 className={styles.title}>Import Settings</h2>
      <p className={styles.desc}>
        Import SEL relay settings for logic visualization. For complete analysis, upload all three
        settings files exported from AcSELerator QuickSet (<code>Set_1</code>, <code>Set_L1</code>, <code>Set_G</code>).
      </p>

      {/* Mode toggle */}
      <div className={styles.modeToggle}>
        <button
          className={`${styles.modeBtn} ${mode === 'multi' ? styles.modeBtnActive : ''}`}
          onClick={() => setMode('multi')}
        >
          Three-File Import
        </button>
        <button
          className={`${styles.modeBtn} ${mode === 'single' ? styles.modeBtnActive : ''}`}
          onClick={() => setMode('single')}
        >
          Single File / Paste
        </button>
      </div>

      <div className={styles.row}>
        <label className={styles.label}>Document label</label>
        <input
          className={styles.input}
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="e.g. Feeder 1A Rev 3"
        />
      </div>

      {/* ─── Multi-file mode ─────────────────────────────────────────────── */}
      {mode === 'multi' && (
        <>
          <div
            className={styles.slotsContainer}
            onDragOver={e => e.preventDefault()}
            onDrop={handleBulkDrop}
          >
            {slots.map((slot, idx) => (
              <div key={idx} className={`${styles.fileSlot} ${slot.text ? styles.fileSlotLoaded : ''}`}>
                <div className={styles.slotHeader}>
                  <span className={styles.slotLabel}>{slot.label}</span>
                  <span className={styles.slotHint}>{slot.defaultFilename}.txt</span>
                </div>
                <p className={styles.slotDesc}>{slot.hint}</p>
                {slot.text ? (
                  <div className={styles.slotLoaded}>
                    <span className={styles.slotFileName}>{slot.fileName || 'Loaded'}</span>
                    <span className={styles.slotLines}>
                      {slot.text.split('\n').filter(l => l.trim()).length} lines
                    </span>
                    <button className={styles.slotClear} onClick={() => clearSlot(idx)}>Clear</button>
                  </div>
                ) : (
                  <div className={styles.slotActions}>
                    <input
                      ref={el => { multiFileRefs.current[idx] = el; }}
                      type="file"
                      accept=".txt,.csv"
                      style={{ display: 'none' }}
                      onChange={e => handleMultiFile(idx, e)}
                    />
                    <button
                      className={styles.slotUploadBtn}
                      onClick={() => multiFileRefs.current[idx]?.click()}
                    >
                      Upload .txt
                    </button>
                    <span className={styles.slotDragHint}>or drag &amp; drop</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className={styles.footer}>
            <span className={styles.charCount}>
              {multiFilesLoaded}/3 files · {multiLineCount} total lines
            </span>
            <button
              className={styles.visualizeBtn}
              onClick={handleVisualizeMulti}
              disabled={multiFilesLoaded === 0}
            >
              Visualize
            </button>
          </div>
        </>
      )}

      {/* ─── Single-file / paste mode ────────────────────────────────────── */}
      {mode === 'single' && (
        <>
          <div className={styles.examplesRow}>
            <span className={styles.exLabel}>Load example:</span>
            <button className={styles.exBtn} onClick={() => loadExample(EXAMPLE_FEEDER_SETTINGS, 'SEL-351 Feeder')}>
              SEL-351 Feeder
            </button>
            <button className={styles.exBtn} onClick={() => loadExample(EXAMPLE_CSV_SETTINGS, 'SEL-751 CSV')}>
              SEL-751 (.txt)
            </button>
            <button className={styles.exBtn} onClick={() => loadExample(EXAMPLE_XFMR_SETTINGS, 'SEL-387 Xfmr')}>
              SEL-387 Xfmr
            </button>
          </div>

          <textarea
            className={styles.textarea}
            value={singleText}
            onChange={e => setSingleText(sanitizeText(e.target.value))}
            placeholder={'Paste SHO SET output here…\n\nOr use "Import from .txt" to load a relay settings file directly.'}
            spellCheck={false}
          />

          <div className={styles.footer}>
            <span className={styles.charCount}>{singleLineCount} lines</span>
            <div className={styles.btnGroup}>
              <input
                ref={singleFileRef}
                type="file"
                accept=".txt,.csv"
                style={{ display: 'none' }}
                onChange={handleSingleFile}
              />
              <button
                className={styles.fileBtn}
                onClick={() => singleFileRef.current?.click()}
              >
                Import from .txt
              </button>
              <button
                className={styles.visualizeBtn}
                onClick={handleVisualizeSingle}
                disabled={!singleText.trim()}
              >
                Visualize
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
