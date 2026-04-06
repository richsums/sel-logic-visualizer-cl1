import React, { useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '../../store/appStore';
import { stepSimulation, resetSimulation, setInput } from '../../core/simulation/engine';
import styles from './SimulationPanel.module.css';

export function SimulationPanel() {
  const { graph, simState, simRunning, setSimState, setSimRunning } = useAppStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function handleStep() {
    if (!graph || !simState) return;
    setSimState(stepSimulation(graph, simState));
  }

  function handleReset() {
    if (!graph) return;
    setSimRunning(false);
    setSimState(resetSimulation(graph));
  }

  function toggleRun() {
    setSimRunning(!simRunning);
  }

  const simStateRef = useRef(simState);
  simStateRef.current = simState;

  useEffect(() => {
    if (simRunning && graph) {
      intervalRef.current = setInterval(() => {
        const current = simStateRef.current;
        if (current) setSimState(stepSimulation(graph, current));
      }, 500);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [simRunning, graph]);

  function toggleInputNode(nodeId: string) {
    if (!simState) return;
    const current = simState.signals.get(nodeId) ?? false;
    setSimState(setInput(simState, nodeId, !current));
  }

  if (!graph || !simState) {
    return <div className={styles.empty}>Import settings to use the simulator.</div>;
  }

  const inputNodes = [...graph.nodes.values()].filter(n => n.kind === 'input');
  const outputNodes = [...graph.nodes.values()].filter(n => n.kind === 'output');
  const derivedNodes = [...graph.nodes.values()].filter(n => n.kind === 'derived');

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Simulation</h3>
        <div className={styles.controls}>
          <button className={styles.btn} onClick={handleStep} disabled={simRunning}>
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
          <span className={styles.stepCount}>Step: {simState.step}</span>
        </div>
      </div>

      <div className={styles.columns}>
        {/* Inputs */}
        <div className={styles.col}>
          <div className={styles.colTitle}>Inputs ({inputNodes.length})</div>
          <div className={styles.nodeList}>
            {inputNodes.map(node => {
              const active = simState.signals.get(node.id) ?? false;
              return (
                <button
                  key={node.id}
                  className={`${styles.nodeBtn} ${active ? styles.nodeActive : ''}`}
                  onClick={() => toggleInputNode(node.id)}
                  title={`Click to toggle ${node.id}`}
                >
                  <span className={styles.nodeId}>{node.id}</span>
                  <span className={`${styles.nodeState} ${active ? styles.stateOn : styles.stateOff}`}>
                    {active ? '1' : '0'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Derived */}
        <div className={styles.col}>
          <div className={styles.colTitle}>Derived ({derivedNodes.length})</div>
          <div className={styles.nodeList}>
            {derivedNodes.map(node => {
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
        </div>

        {/* Outputs */}
        <div className={styles.col}>
          <div className={styles.colTitle}>Outputs ({outputNodes.length})</div>
          <div className={styles.nodeList}>
            {outputNodes.map(node => {
              const active = simState.signals.get(node.id) ?? false;
              return (
                <div key={node.id} className={`${styles.nodeRow} ${active ? styles.nodeOutputActive : ''}`}>
                  <span className={styles.nodeId}>{node.id}</span>
                  <span className={`${styles.nodeState} ${active ? styles.stateOn : styles.stateOff}`}>
                    {active ? '1' : '0'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
