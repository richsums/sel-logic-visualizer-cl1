import React, { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useAppStore } from '../../store/appStore';
import { buildFlowGraph } from './graphTransform';
import { SelNode } from './SelNode';
import { traceNode } from '../../core/analysis/engine';
import styles from './GraphView.module.css';

const nodeTypes = { selNode: SelNode };

export function GraphView() {
  const {
    graph, simState, selectedNodeId, highlightedNodeIds,
    simFocusedOutputId, simActivePaths,
    setSelectedNodeId, setHighlightedNodeIds, setActivePanel,
    setSimFocusedOutputId,
  } = useAppStore();

  const { nodes: flowNodes, edges: flowEdges } = useMemo(() => {
    if (!graph) return { nodes: [], edges: [] };
    return buildFlowGraph(
      graph, simState, selectedNodeId, highlightedNodeIds,
      simActivePaths, simFocusedOutputId,
    );
  }, [graph, simState, selectedNodeId, highlightedNodeIds, simActivePaths, simFocusedOutputId]);

  const [, , onNodesChange] = useNodesState(flowNodes);
  const [, , onEdgesChange] = useEdgesState(flowEdges);

  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    if (!graph) return;

    // If simulation is active and this is an output node, toggle causal path focus
    const irNode = graph.nodes.get(node.id);
    if (simState && irNode?.kind === 'output') {
      if (simFocusedOutputId === node.id) {
        // Click same output again → clear focus
        setSimFocusedOutputId(null);
      } else {
        setSimFocusedOutputId(node.id);
      }
      return;
    }

    // Normal mode: select + trace + show analysis
    setSelectedNodeId(node.id);
    const trace = traceNode(graph, node.id);
    const highlighted = new Set([...trace.upstream, node.id, ...trace.downstream]);
    setHighlightedNodeIds(highlighted);
    setActivePanel('analysis');
  }, [graph, simState, simFocusedOutputId, setSelectedNodeId, setHighlightedNodeIds, setActivePanel, setSimFocusedOutputId]);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setHighlightedNodeIds(new Set());
    setSimFocusedOutputId(null);
  }, [setSelectedNodeId, setHighlightedNodeIds, setSimFocusedOutputId]);

  if (!graph) {
    return (
      <div className={styles.empty}>
        <p>No settings loaded. Use the Import panel to paste QuickSet output.</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.1}
        maxZoom={3}
        colorMode="dark"
      >
        <Background color="#2d3748" gap={20} />
        <Controls />
        <MiniMap
          nodeColor={(n) => {
            const kind = (n.data as { kind: string }).kind;
            if (kind === 'output') return '#9e4a6d';
            if (kind === 'input') return '#4a6d9e';
            if ((n.data as { active: boolean }).active) return '#4ade80';
            return '#4a5568';
          }}
          style={{ background: '#1a202c' }}
        />
      </ReactFlow>
      {simFocusedOutputId && (
        <div className={styles.focusBanner}>
          Tracing: <strong>{simFocusedOutputId}</strong>
          <button
            onClick={() => setSimFocusedOutputId(null)}
            style={{
              marginLeft: 8, background: 'none', border: '1px solid #4b5563',
              color: '#9ca3af', borderRadius: 3, padding: '1px 6px', cursor: 'pointer',
              fontSize: 11,
            }}
          >
            Clear
          </button>
        </div>
      )}
      <div className={styles.legend}>
        {[
          { kind: 'input', label: 'Input' },
          { kind: 'output', label: 'Output' },
          { kind: 'derived', label: 'Derived' },
          { kind: 'and', label: 'AND' },
          { kind: 'or', label: 'OR' },
          { kind: 'not', label: 'NOT' },
          { kind: 'timer', label: 'Timer' },
          { kind: 'latch', label: 'Latch' },
          { kind: 'rising', label: 'R_TRIG' },
          { kind: 'falling', label: 'F_TRIG' },
          { kind: 'pulse', label: 'Pulse' },
        ].map(({ kind, label }) => (
          <span key={kind} className={styles.legendItem} data-kind={kind}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
