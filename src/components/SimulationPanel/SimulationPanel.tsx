import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../store/appStore';
import { stepSimulation, resetSimulation, setInput } from '../../core/simulation/engine';
import { SimInputList } from './SimInputList';
import { SimOutputList } from './SimOutputList';
import { SimTimerList } from './SimTimerList';
import { SimLatchList } from './SimLatchList';
import { SimDerivedList } from './SimDerivedList';
import styles from './SimulationPanel.module.css';

type SimTab = 'inputs' | 'outputs' | 'timers' | 'latches' | 'derived';

const TAB_LABELS: Record<SimTab, string> = {
  inputs: 'Inputs',
  outputs: 'Outputs',
  timers: 'Timers',
  latches: 'Latches',
  derived: 'Derived',
};

export function SimulationPanel() {
  const {
    graph, simState, simRunning, simFocusedOutputId,
    simInputFilter, simActivePaths,
    setSimState, setSimRunning, setSimFocusedOutputId,
    setSimInputFilter, setSimActivePaths,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<SimTab>('inputs');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const doStep = useCallback(() => {
    if (!graph || !simState) return;
    const next = stepSimulation(graph, simState);
    setSimState(next);
    setSimActivePaths(next.activePaths);
  }, [graph, simState, setSimState, setSimActivePaths]);

  function handleReset() {
    if (!graph) return;
    setSimRunning(false);
    const fresh = resetSimulation(graph);
    setSimState(fresh);
    setSimActivePaths([]);
    setSimFocusedOutputId(null);
  }

  function toggleRun() {
    setSimRunning(!simRunning);
  }

  // Keep a ref so the interval always sees latest simState
  const simStateRef = useRef(simState);
  simStateRef.current = simState;

  useEffect(() => {
    if (simRunning && graph) {
      intervalRef.current = setInterval(() => {
        const current = simStateRef.current;
        if (current) {
          const next = stepSimulation(graph, current);
          setSimState(next);
          setSimActivePaths(next.activePaths);
        }
      }, 500);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [simRunning, graph, setSimState, setSimActivePaths]);

  const toggleInputNode = useCallback((nodeId: string) => {
    if (!simState || !graph) return;
    const current = simState.signals.get(nodeId) ?? false;
    const toggled = setInput(simState, nodeId, !current);
    // Auto-re-evaluate after toggle
    const next = stepSimulation(graph, toggled);
    setSimState(next);
    setSimActivePaths(next.activePaths);
  }, [simState, graph, setSimState, setSimActivePaths]);

  if (!graph || !simState) {
    return <div className={styles.empty}>Import settings to use the simulator.</div>;
  }

  const allNodes = [...graph.nodes.values()];
  const inputNodes = allNodes.filter(n => n.kind === 'input');
  const outputNodes = allNodes.filter(n => n.kind === 'output');
  const timerNodes = allNodes.filter(n => n.kind === 'timer');
  const latchNodes = allNodes.filter(n => n.kind === 'latch');
  const derivedNodes = allNodes.filter(n => n.kind === 'derived');

  // Tab counts
  const tabCounts: Record<SimTab, number> = {
    inputs: inputNodes.length,
    outputs: outputNodes.length,
    timers: timerNodes.length,
    latches: latchNodes.length,
    derived: derivedNodes.length,
  };

  // Only show tabs that have nodes (always show inputs/outputs)
  const visibleTabs: SimTab[] = ['inputs', 'outputs'];
  if (timerNodes.length > 0) visibleTabs.push('timers');
  if (latchNodes.length > 0) visibleTabs.push('latches');
  if (derivedNodes.length > 0) visibleTabs.push('derived');

  const assertedOutputs = outputNodes.filter(n => simState.signals.get(n.id) ?? false).length;

  return (
    <div className={styles.panel}>
      {/* Header with controls */}
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <h3 className={styles.title}>Simulation</h3>
          <div className={styles.controls}>
            <button className={styles.btn} onClick={doStep} disabled={simRunning}>
              Step
            </button>
            <button
              className={`${styles.btn} ${simRunning ? styles.btnStop : styles.btnRun}`}
              onClick={toggleRun}
            >
              {simRunning ? 'Stop' : 'Run'}
            </button>
            <button className={styles.btn} onClick={handleReset}>
              Reset
            </button>
          </div>
        </div>
        <div className={styles.statusBar}>
          <span className={styles.stepCount}>Step {simState.step}</span>
          <span className={styles.separator}>|</span>
          <span className={assertedOutputs > 0 ? styles.assertedCount : styles.quietCount}>
            {assertedOutputs} output{assertedOutputs !== 1 ? 's' : ''} asserted
          </span>
          {simFocusedOutputId && (
            <>
              <span className={styles.separator}>|</span>
              <span className={styles.traceLabel}>
                Tracing: <strong>{simFocusedOutputId}</strong>
              </span>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        {visibleTabs.map(tab => (
          <button
            key={tab}
            className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {TAB_LABELS[tab]}
            <span className={styles.tabCount}>{tabCounts[tab]}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className={styles.tabContent}>
        {activeTab === 'inputs' && (
          <SimInputList
            nodes={inputNodes}
            simState={simState}
            filter={simInputFilter}
            onFilterChange={setSimInputFilter}
            onToggle={toggleInputNode}
          />
        )}
        {activeTab === 'outputs' && (
          <SimOutputList
            nodes={outputNodes}
            simState={simState}
            focusedOutputId={simFocusedOutputId}
            onFocusOutput={setSimFocusedOutputId}
          />
        )}
        {activeTab === 'timers' && (
          <SimTimerList nodes={timerNodes} simState={simState} />
        )}
        {activeTab === 'latches' && (
          <SimLatchList nodes={latchNodes} simState={simState} />
        )}
        {activeTab === 'derived' && (
          <SimDerivedList nodes={derivedNodes} simState={simState} />
        )}
      </div>
    </div>
  );
}
