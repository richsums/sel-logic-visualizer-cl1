import React, { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type NodeMouseHandler,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useAppStore } from '../../store/appStore';
import { buildFlowGraph, type FlowNode, type FlowEdge } from './graphTransform';
import { SelNode } from './SelNode';
import { NegatedEdge } from './NegatedEdge';
import { ContextMenu } from './ContextMenu';
import { useLongPress } from './useLongPress';
import { traceNode } from '../../core/analysis/engine';
import { setInput, stepSimulation, resetSimulation, createSimState } from '../../core/simulation/engine';
import styles from './GraphView.module.css';

const nodeTypes = { selNode: SelNode };
const edgeTypes = { negatedEdge: NegatedEdge };

export function GraphView() {
  return (
    <ReactFlowProvider>
      <GraphViewInner />
    </ReactFlowProvider>
  );
}

function GraphViewInner() {
  const {
    graph, simState, selectedNodeId, highlightedNodeIds,
    simFocusedOutputId, simActivePaths, hiddenNodeIds, colorMode,
    setSelectedNodeId, setHighlightedNodeIds, setActivePanel,
    setSimFocusedOutputId, setSimState, setSimActivePaths,
    hideNode,
  } = useAppStore();

  // Track graph identity for re-layout
  const prevGraphRef = useRef<typeof graph>(null);
  const { fitView } = useReactFlow();

  // Persistent user-dragged positions
  const dragPositions = useRef(new Map<string, { x: number; y: number }>());

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; nodeId: string; nodeLabel: string;
  } | null>(null);

  // ─── Long-press for mobile context menu ────────────────────────────────
  const handleLongPress = useCallback((x: number, y: number, target: HTMLElement) => {
    // Walk up DOM to find the React Flow node wrapper with data-id
    let el: HTMLElement | null = target;
    while (el && !el.getAttribute('data-id')) {
      el = el.parentElement;
    }
    if (!el) return;
    const nodeId = el.getAttribute('data-id');
    if (!nodeId || !graph) return;

    // Haptic feedback on mobile if available
    if (navigator.vibrate) navigator.vibrate(30);

    const irNode = graph.nodes.get(nodeId);
    setContextMenu({
      x,
      y,
      nodeId,
      nodeLabel: irNode?.label ?? nodeId,
    });
  }, [graph]);

  const { onTouchStart, onTouchMove, onTouchEnd, didLongPress } = useLongPress({
    delay: 500,
    onLongPress: handleLongPress,
  });

  // Build the flow graph data
  const flowData = useMemo(() => {
    if (!graph) return { nodes: [], edges: [] };
    return buildFlowGraph(
      graph, simState, selectedNodeId, highlightedNodeIds,
      simActivePaths, simFocusedOutputId, hiddenNodeIds,
    );
  }, [graph, simState, selectedNodeId, highlightedNodeIds,
      simActivePaths, simFocusedOutputId, hiddenNodeIds]);

  // Detect graph change → clear drag positions for full re-layout and fit view
  useEffect(() => {
    if (graph !== prevGraphRef.current) {
      dragPositions.current.clear();
      prevGraphRef.current = graph;
      // Defer fitView so React Flow has time to render the new nodes
      requestAnimationFrame(() => {
        fitView({ padding: 0.15 });
      });
    }
  }, [graph, fitView]);

  // Apply dragged positions over dagre-computed ones
  const nodesWithDrag = useMemo(() => {
    return flowData.nodes.map(n => {
      const dragged = dragPositions.current.get(n.id);
      return dragged ? { ...n, position: dragged } : n;
    });
  }, [flowData.nodes]);

  const [nodes, setNodes, onNodesChange] = useNodesState(nodesWithDrag);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowData.edges);

  // Sync when flow data changes (sim state, etc.) — preserve drag positions
  useEffect(() => {
    setNodes(nodesWithDrag);
    setEdges(flowData.edges);
  }, [nodesWithDrag, flowData.edges, setNodes, setEdges]);

  // Capture drag position changes
  const handleNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => {
    onNodesChange(changes);
    for (const change of changes) {
      if (change.type === 'position' && change.position) {
        dragPositions.current.set(change.id, change.position);
      }
    }
  }, [onNodesChange]);

  // ─── Left-click / tap: toggle logical state ─────────────────────────────
  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    // Suppress tap if it was actually a long-press (mobile context menu)
    if (didLongPress.current) {
      didLongPress.current = false;
      return;
    }
    if (!graph) return;

    // Ensure sim state exists
    let state = simState;
    if (!state) {
      state = createSimState(graph);
    }

    // Toggle the signal for this node
    const current = state.signals.get(node.id) ?? false;
    const toggled = setInput(state, node.id, !current);

    // Propagate
    const next = stepSimulation(graph, toggled);
    setSimState(next);
    setSimActivePaths(next.activePaths);

    // Highlight the selected node
    setSelectedNodeId(node.id);
    const trace = traceNode(graph, node.id);
    const highlighted = new Set([...trace.upstream, node.id, ...trace.downstream]);
    setHighlightedNodeIds(highlighted);
  }, [graph, simState, setSimState, setSimActivePaths, setSelectedNodeId, setHighlightedNodeIds]);

  // ─── Right-click: context menu ──────────────────────────────────────────
  const onNodeContextMenu: NodeMouseHandler = useCallback((event, node) => {
    event.preventDefault();
    const irNode = graph?.nodes.get(node.id);
    setContextMenu({
      x: (event as unknown as MouseEvent).clientX,
      y: (event as unknown as MouseEvent).clientY,
      nodeId: node.id,
      nodeLabel: irNode?.label ?? node.id,
    });
  }, [graph]);

  const handleRemoveFromView = useCallback(() => {
    if (contextMenu) {
      hideNode(contextMenu.nodeId);
      setContextMenu(null);
    }
  }, [contextMenu, hideNode]);

  const handleElementBreakdown = useCallback(() => {
    if (contextMenu) {
      setSelectedNodeId(contextMenu.nodeId);
      if (graph) {
        const trace = traceNode(graph, contextMenu.nodeId);
        setHighlightedNodeIds(new Set([...trace.upstream, contextMenu.nodeId, ...trace.downstream]));
      }
      setActivePanel('analysis');
      setContextMenu(null);
    }
  }, [contextMenu, graph, setSelectedNodeId, setHighlightedNodeIds, setActivePanel]);

  // ─── Pane click: clear selection ────────────────────────────────────────
  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setHighlightedNodeIds(new Set());
    setSimFocusedOutputId(null);
    setContextMenu(null);
  }, [setSelectedNodeId, setHighlightedNodeIds, setSimFocusedOutputId]);

  // ─── Reset states ──────────────────────────────────────────────────────
  const handleResetStates = useCallback(() => {
    if (!graph) return;
    const fresh = resetSimulation(graph);
    setSimState(fresh);
    setSimActivePaths([]);
    setSimFocusedOutputId(null);
    setSelectedNodeId(null);
    setHighlightedNodeIds(new Set());
  }, [graph, setSimState, setSimActivePaths, setSimFocusedOutputId, setSelectedNodeId, setHighlightedNodeIds]);

  if (!graph) {
    return (
      <div className={styles.empty}>
        <p>No settings loaded. Use the Import panel to paste QuickSet output.</p>
      </div>
    );
  }

  return (
    <div
      className={styles.container}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onNodeContextMenu={onNodeContextMenu}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        minZoom={0.1}
        maxZoom={3}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        elevateNodesOnSelect={false}
        selectNodesOnDrag={false}
        colorMode={colorMode}
      >
        <Background color={colorMode === 'dark' ? '#2d3748' : '#e2e8f0'} gap={20} />
        <Controls />
        <MiniMap
          nodeColor={(n) => {
            const kind = (n.data as { kind: string }).kind;
            if (kind === 'output') return '#9e4a6d';
            if (kind === 'input') return '#4a6d9e';
            if ((n.data as { active: boolean }).active) return '#4ade80';
            return '#4a5568';
          }}
          style={{ background: colorMode === 'dark' ? '#1a202c' : '#f7fafc' }}
        />
      </ReactFlow>

      {/* Graph toolbar */}
      <div className={styles.graphToolbar}>
        <button className={styles.toolbarBtn} onClick={handleResetStates} title="Reset all toggled states to default">
          Reset States
        </button>
      </div>

      {/* Focus banner */}
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

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          nodeId={contextMenu.nodeId}
          nodeLabel={contextMenu.nodeLabel}
          onRemoveFromView={handleRemoveFromView}
          onElementBreakdown={handleElementBreakdown}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Legend */}
      <div className={styles.legend}>
        {[
          { kind: 'input', label: 'Input' },
          { kind: 'output', label: 'Output' },
          { kind: 'derived', label: 'Derived' },
          { kind: 'and', label: 'AND' },
          { kind: 'or', label: 'OR' },
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
