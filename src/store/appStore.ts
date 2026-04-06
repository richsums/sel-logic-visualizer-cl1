// ─── App state store (Zustand) ────────────────────────────────────────────────
import { create } from 'zustand';
import type { ImportedSettingsDocument } from '../core/importer/types';
import type { IRGraph } from '../core/ir/types';
import type { SimState } from '../core/simulation/engine';
import type { ComparisonResult } from '../core/comparison/engine';
import type { AnalysisReport } from '../core/analysis/engine';

export type AppPanel =
  | 'import'
  | 'raw'
  | 'settings'
  | 'graph'
  | 'diagnostics'
  | 'analysis'
  | 'export'
  | 'simulation'
  | 'comparison'
  | 'tutorial';

interface AppState {
  // Documents
  docA: ImportedSettingsDocument | null;
  docB: ImportedSettingsDocument | null;  // for comparison

  // Derived
  graph: IRGraph | null;
  analysisReport: AnalysisReport | null;
  comparisonResult: ComparisonResult | null;

  // Simulation
  simState: SimState | null;
  simRunning: boolean;

  // UI state
  activePanel: AppPanel;
  selectedNodeId: string | null;
  highlightedNodeIds: Set<string>;

  // Actions
  setDocA: (doc: ImportedSettingsDocument) => void;
  setDocB: (doc: ImportedSettingsDocument) => void;
  setGraph: (g: IRGraph) => void;
  setAnalysisReport: (r: AnalysisReport) => void;
  setComparisonResult: (r: ComparisonResult) => void;
  setSimState: (s: SimState) => void;
  setSimRunning: (v: boolean) => void;
  setActivePanel: (p: AppPanel) => void;
  setSelectedNodeId: (id: string | null) => void;
  setHighlightedNodeIds: (ids: Set<string>) => void;
  reset: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  docA: null,
  docB: null,
  graph: null,
  analysisReport: null,
  comparisonResult: null,
  simState: null,
  simRunning: false,
  activePanel: 'import',
  selectedNodeId: null,
  highlightedNodeIds: new Set(),

  setDocA: (docA) => set({ docA }),
  setDocB: (docB) => set({ docB }),
  setGraph: (graph) => set({ graph }),
  setAnalysisReport: (analysisReport) => set({ analysisReport }),
  setComparisonResult: (comparisonResult) => set({ comparisonResult }),
  setSimState: (simState) => set({ simState }),
  setSimRunning: (simRunning) => set({ simRunning }),
  setActivePanel: (activePanel) => set({ activePanel }),
  setSelectedNodeId: (selectedNodeId) => set({ selectedNodeId }),
  setHighlightedNodeIds: (highlightedNodeIds) => set({ highlightedNodeIds }),
  reset: () => set({
    docA: null, docB: null, graph: null, analysisReport: null,
    comparisonResult: null, simState: null, simRunning: false,
    selectedNodeId: null, highlightedNodeIds: new Set(),
  }),
}));
