import React, { useMemo, useState, useCallback } from 'react';
import { useAppStore } from '../../store/appStore';
import {
  generateTestScenarios,
  generateBinaryIOMap,
  generateTruthTable,
  truthTableToCSV,
  scenariosToText,
  computeCoverage,
  type TestScenario,
  type LogicPath,
  type BinaryIOEntry,
} from '../../core/testplan/engine';
import styles from './TestPlanPanel.module.css';

type Tab = 'testplan' | 'coverage' | 'io' | 'truth';

const OUTPUT_CLASS_BADGE: Record<string, { css: string; label: string }> = {
  trip:             { css: styles.badgeTrip,    label: 'TRIP' },
  close:            { css: styles.badgeClose,   label: 'CLOSE' },
  alarm:            { css: styles.badgeAlarm,   label: 'ALARM' },
  breaker_failure:  { css: styles.badgeBf,      label: 'BF' },
  reclose:          { css: styles.badgeReclose,  label: 'RECLOSE' },
  block:            { css: styles.badgeOther,   label: 'BLOCK' },
  display:          { css: styles.badgeOther,   label: 'DISPLAY' },
  led:              { css: styles.badgeOther,   label: 'LED' },
  supervisory:      { css: styles.badgeOther,   label: 'SUPV' },
  other:            { css: styles.badgeOther,   label: 'OUT' },
};

// ─── Helper: download file ────────────────────────────────────────────────

function download(filename: string, content: string, mime: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ─── Main component ───────────────────────────────────────────────────────

export function TestPlanPanel() {
  const { graph, docA } = useAppStore();
  const [activeTab, setActiveTab] = useState<Tab>('testplan');
  const [expandedOutputs, setExpandedOutputs] = useState<Set<string>>(new Set());
  const [checkedPaths, setCheckedPaths] = useState<Set<string>>(new Set());
  const [truthOutputId, setTruthOutputId] = useState<string>('');

  // Generate scenarios
  const scenarios = useMemo(() => {
    if (!graph) return [];
    return generateTestScenarios(graph);
  }, [graph]);

  // Binary I/O map
  const binaryIO = useMemo(() => {
    if (!graph) return [];
    return generateBinaryIOMap(graph);
  }, [graph]);

  // Coverage with checked state applied
  const scenariosWithChecks = useMemo(() => {
    return scenarios.map(s => ({
      ...s,
      paths: s.paths.map(p => ({ ...p, checked: checkedPaths.has(p.id) })),
    }));
  }, [scenarios, checkedPaths]);

  const coverage = useMemo(() => computeCoverage(scenariosWithChecks), [scenariosWithChecks]);

  // Truth table
  const truthTable = useMemo(() => {
    if (!graph || !truthOutputId) return null;
    return generateTruthTable(graph, truthOutputId);
  }, [graph, truthOutputId]);

  // Set initial truth table output
  useMemo(() => {
    if (scenarios.length > 0 && !truthOutputId) {
      setTruthOutputId(scenarios[0].outputId);
    }
  }, [scenarios, truthOutputId]);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedOutputs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const togglePath = useCallback((pathId: string) => {
    setCheckedPaths(prev => {
      const next = new Set(prev);
      if (next.has(pathId)) next.delete(pathId); else next.add(pathId);
      return next;
    });
  }, []);

  const handleExportTestPlan = useCallback(() => {
    if (!docA) return;
    const text = scenariosToText(scenariosWithChecks, docA.label);
    download(`${docA.label}_test_plan.txt`, text, 'text/plain');
  }, [scenariosWithChecks, docA]);

  const handleExportTruthTable = useCallback(() => {
    if (!truthTable || !truthOutputId || !docA) return;
    const csv = truthTableToCSV(truthOutputId, truthTable);
    download(`${docA.label}_truth_table_${truthOutputId}.csv`, csv, 'text/csv');
  }, [truthTable, truthOutputId, docA]);

  const handleExportIOMap = useCallback(() => {
    if (!docA) return;
    const header = 'Relay Terminal,Direction,Function,CMC Suggestion';
    const rows = binaryIO.map(b =>
      `${b.relayTerminal},${b.direction},${JSON.stringify(b.function)},${JSON.stringify(b.cmcSuggestion)}`
    );
    download(`${docA.label}_binary_io_map.csv`, [header, ...rows].join('\n'), 'text/csv');
  }, [binaryIO, docA]);

  if (!graph) {
    return <div className={styles.empty}>Import relay settings to generate test plan.</div>;
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Test Plan</h3>
        <div className={styles.headerActions}>
          {activeTab === 'testplan' && (
            <button className={styles.btn} onClick={handleExportTestPlan}>Export Plan</button>
          )}
          {activeTab === 'truth' && (
            <button className={styles.btn} onClick={handleExportTruthTable} disabled={!truthTable}>Export CSV</button>
          )}
          {activeTab === 'io' && (
            <button className={styles.btn} onClick={handleExportIOMap}>Export CSV</button>
          )}
        </div>
      </div>

      <div className={styles.tabs}>
        {([
          ['testplan', 'Test Plan'],
          ['coverage', 'Coverage'],
          ['io', 'Binary I/O Map'],
          ['truth', 'Truth Table'],
        ] as [Tab, string][]).map(([id, label]) => (
          <button
            key={id}
            className={`${styles.tab} ${activeTab === id ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={styles.content}>
        {activeTab === 'testplan' && (
          <TestPlanTab
            scenarios={scenariosWithChecks}
            expandedOutputs={expandedOutputs}
            onToggleExpand={toggleExpanded}
            onTogglePath={togglePath}
          />
        )}
        {activeTab === 'coverage' && (
          <CoverageTab coverage={coverage} scenarios={scenariosWithChecks} />
        )}
        {activeTab === 'io' && (
          <BinaryIOTab entries={binaryIO} />
        )}
        {activeTab === 'truth' && (
          <TruthTableTab
            scenarios={scenarios}
            selectedOutputId={truthOutputId}
            onSelectOutput={setTruthOutputId}
            table={truthTable}
          />
        )}
      </div>
    </div>
  );
}

// ─── Test Plan Tab ──────────────────────────────────────────────────────────

function TestPlanTab({
  scenarios,
  expandedOutputs,
  onToggleExpand,
  onTogglePath,
}: {
  scenarios: TestScenario[];
  expandedOutputs: Set<string>;
  onToggleExpand: (id: string) => void;
  onTogglePath: (pathId: string) => void;
}) {
  if (scenarios.length === 0) {
    return <div className={styles.empty}>No outputs found in the logic graph.</div>;
  }

  return (
    <>
      {scenarios.map(s => {
        const expanded = expandedOutputs.has(s.outputId);
        const badgeInfo = OUTPUT_CLASS_BADGE[s.outputClass] ?? OUTPUT_CLASS_BADGE.other;
        const checkedCount = s.paths.filter(p => p.checked).length;

        return (
          <div key={s.outputId} className={styles.scenarioCard}>
            <div className={styles.scenarioHeader} onClick={() => onToggleExpand(s.outputId)}>
              <div className={styles.scenarioTitle}>
                <span className={`${styles.chevron} ${expanded ? styles.chevronOpen : ''}`}>&#9654;</span>
                <span className={styles.outputName}>{s.outputLabel}</span>
                <span className={`${styles.badge} ${badgeInfo.css}`}>{badgeInfo.label}</span>
              </div>
              <span className={styles.pathCount}>
                {checkedCount}/{s.paths.length} paths tested
              </span>
            </div>

            {expanded && (
              <div className={styles.scenarioBody}>
                {s.paths.map((p, i) => (
                  <PathItem key={p.id} path={p} index={i + 1} onToggle={onTogglePath} />
                ))}

                {s.stateSequence.length > 0 && (
                  <div className={styles.stateSequence}>
                    <div className={styles.stateSeqTitle}>Suggested Omicron State Sequence</div>
                    {s.stateSequence.map((step, i) => (
                      <div key={i} className={styles.stateStep}>
                        <div className={styles.stateStepName}>State {i + 1}: {step.name}</div>
                        <div className={styles.stateStepDetail}>{step.description}</div>
                        <div className={styles.stateStepDetail}>
                          <span className={styles.stateStepLabel}>Transition:</span> {step.transition}
                        </div>
                        <div className={styles.stateStepDetail}>
                          <span className={styles.stateStepLabel}>Analog:</span> {step.analogHint}
                        </div>
                        {step.binaryOutputs.length > 0 && (
                          <div className={styles.stateStepDetail}>
                            <span className={styles.stateStepLabel}>CMC Binary Out:</span>{' '}
                            {step.binaryOutputs.map(b => `${b.label}=${b.state ? 'ON' : 'OFF'}`).join(', ')}
                          </div>
                        )}
                        <div className={styles.stateStepDetail}>
                          <span className={styles.stateStepLabel}>Expected:</span>{' '}
                          {step.expectedInputs.map(b => `${b.label}=${b.state ? 'ASSERT' : 'IDLE'}`).join(', ')}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

// ─── Path item ────────────────────────────────────────────────────────────

function PathItem({
  path,
  index,
  onToggle,
}: {
  path: LogicPath;
  index: number;
  onToggle: (id: string) => void;
}) {
  return (
    <div className={styles.pathItem}>
      <input
        type="checkbox"
        className={styles.pathCheckbox}
        checked={path.checked}
        onChange={() => onToggle(path.id)}
        title="Mark as tested"
      />
      <div className={styles.pathContent}>
        <div className={styles.pathLabel}>Path {index}</div>
        <div className={styles.pathConditions}>
          {path.requiredInputs.map(c => (
            <span
              key={c.nodeId}
              className={`${styles.conditionChip} ${c.requiredState ? styles.conditionAssert : styles.conditionDeassert}`}
              title={c.injectionHint}
            >
              {c.label} = {c.requiredState ? '1' : '0'}
            </span>
          ))}
        </div>
        {path.requiredInputs.length > 0 && (
          <div className={styles.injectionHint}>
            {path.requiredInputs
              .map(c => c.injectionHint)
              .filter((v, i, a) => a.indexOf(v) === i)
              .join(' | ')}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Coverage Tab ─────────────────────────────────────────────────────────

function CoverageTab({
  coverage,
  scenarios,
}: {
  coverage: ReturnType<typeof computeCoverage>;
  scenarios: TestScenario[];
}) {
  const pct = coverage.totalPaths > 0
    ? Math.round((coverage.checkedPaths / coverage.totalPaths) * 100)
    : 0;

  const barColor = pct >= 100 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <>
      <div className={styles.coverageSummary}>
        <div className={styles.coverageStats}>
          <span>{coverage.totalOutputs} outputs</span>
          <span>{coverage.checkedPaths}/{coverage.totalPaths} paths tested ({pct}%)</span>
        </div>
        <div className={styles.coverageBar}>
          <div
            className={styles.coverageFill}
            style={{ width: `${pct}%`, background: barColor }}
          />
        </div>
      </div>

      {coverage.outputCoverage.map(oc => {
        const ocPct = oc.totalPaths > 0
          ? Math.round((oc.checkedPaths / oc.totalPaths) * 100)
          : 0;
        const badgeInfo = OUTPUT_CLASS_BADGE[oc.outputClass] ?? OUTPUT_CLASS_BADGE.other;

        return (
          <div key={oc.outputId} className={styles.coverageRow}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className={styles.coverageLabel}>{oc.label}</span>
              <span className={`${styles.badge} ${badgeInfo.css}`} style={{ fontSize: '0.58rem' }}>
                {badgeInfo.label}
              </span>
            </div>
            <span className={styles.coverageProgress}>
              {oc.checkedPaths}/{oc.totalPaths} ({ocPct}%)
            </span>
          </div>
        );
      })}
    </>
  );
}

// ─── Binary I/O Tab ───────────────────────────────────────────────────────

function BinaryIOTab({ entries }: { entries: BinaryIOEntry[] }) {
  if (entries.length === 0) {
    return <div className={styles.empty}>No binary I/O found in the logic.</div>;
  }

  // Split into outputs and inputs
  const outputs = entries.filter(e => e.direction === 'relay-output');
  const inputs = entries.filter(e => e.direction === 'relay-input');

  return (
    <>
      {outputs.length > 0 && (
        <>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--c-accent)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Relay Outputs (CMC monitors)
          </div>
          <table className={styles.ioTable}>
            <thead>
              <tr>
                <th>Terminal</th>
                <th>Direction</th>
                <th>Function</th>
                <th>CMC Connection</th>
              </tr>
            </thead>
            <tbody>
              {outputs.map(e => (
                <tr key={e.relayTerminal}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{e.relayTerminal}</td>
                  <td><span className={`${styles.ioDirection} ${styles.ioOutput}`}>OUTPUT</span></td>
                  <td>{e.function}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.72rem' }}>{e.cmcSuggestion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {inputs.length > 0 && (
        <>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--c-accent)', marginTop: 16, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Relay Inputs (CMC drives)
          </div>
          <table className={styles.ioTable}>
            <thead>
              <tr>
                <th>Terminal</th>
                <th>Direction</th>
                <th>Function</th>
                <th>CMC Connection</th>
              </tr>
            </thead>
            <tbody>
              {inputs.map(e => (
                <tr key={e.relayTerminal}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{e.relayTerminal}</td>
                  <td><span className={`${styles.ioDirection} ${styles.ioInput}`}>INPUT</span></td>
                  <td>{e.function}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.72rem' }}>{e.cmcSuggestion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

// ─── Truth Table Tab ──────────────────────────────────────────────────────

function TruthTableTab({
  scenarios,
  selectedOutputId,
  onSelectOutput,
  table,
}: {
  scenarios: TestScenario[];
  selectedOutputId: string;
  onSelectOutput: (id: string) => void;
  table: { inputLabels: string[]; rows: { inputs: boolean[]; output: boolean }[] } | null;
}) {
  const selectedScenario = scenarios.find(s => s.outputId === selectedOutputId);

  return (
    <>
      <div className={styles.truthControls}>
        <label style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--c-text-secondary)' }}>
          Output:
        </label>
        <select
          className={styles.truthSelect}
          value={selectedOutputId}
          onChange={e => onSelectOutput(e.target.value)}
        >
          {scenarios.map(s => {
            const badge = OUTPUT_CLASS_BADGE[s.outputClass] ?? OUTPUT_CLASS_BADGE.other;
            return (
              <option key={s.outputId} value={s.outputId}>
                {s.outputLabel} [{badge.label}]
              </option>
            );
          })}
        </select>
      </div>

      {table && table.rows.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table className={styles.truthTable}>
            <thead>
              <tr>
                {table.inputLabels.map(label => (
                  <th key={label}>{label}</th>
                ))}
                <th style={{ borderLeft: '2px solid var(--c-accent)' }}>
                  {selectedOutputId}
                </th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.inputs.map((v, ci) => (
                    <td key={ci} className={v ? styles.truthOne : styles.truthZero}>
                      {v ? '1' : '0'}
                    </td>
                  ))}
                  <td
                    className={`${styles.truthOutput} ${row.output ? styles.truthOne : styles.truthZero}`}
                    style={{ borderLeft: '2px solid var(--c-accent)' }}
                  >
                    {row.output ? '1' : '0'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={styles.empty}>
          {selectedOutputId ? 'No truth table data for this output.' : 'Select an output above.'}
        </div>
      )}
    </>
  );
}
