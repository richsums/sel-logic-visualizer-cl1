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
    setSelectedNodeId, setHighlightedNodeIds, setActivePanel,
  } = useAppStore();

  const { nodes: flowNodes, edges: flowEdges } = useMemo(() => {
    if (!graph) return { nodes: [], edges: [] };
    return buildFlowGraph(graph, simState, selectedNodeId, highlightedNodeIds);
  }, [graph, simState, selectedNodeId, highlightedNodeIds]);

  const [, , onNodesChange] = useNodesState(flowNodes);
  const [, , onEdgesChange] = useEdgesState(flowEdges);

  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    if (!graph) return;
    setSelectedNodeId(node.id);
    const trace = traceNode(graph, node.id);
    const highlighted = new Set([...trace.upstream, node.id, ...trace.downstream]);
    setHighlightedNodeIds(highlighted);
    setActivePanel('analysis');
  }, [graph, setSelectedNodeId, setHighlightedNodeIds, setActivePanel]);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setHighlightedNodeIds(new Set());
  }, [setSelectedNodeId, setHighlightedNodeIds]);

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
