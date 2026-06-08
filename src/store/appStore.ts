// ─── App state store (Zustand) ────────────────────────────────────────────────
import { create } from 'zustand';
import type { ImportedSettingsDocument } from '../core/importer/types';
import type { IRGraph } from '../core/ir/types';
import type { SimState, ActivePathRecord } from '../core/simulation/engine';
import type { ComparisonResult } from '../core/comparison/engine';
import type { AnalysisReport } from '../core/analysis/engine';
import type { SEREvent } from '../core/ser/parser';

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
  | 'tutorial'
  | 'testplan'
  | 'ser';

export type SimViewMode = 'compact' | 'expanded';
export type ColorMode = 'dark' | 'light';

interface AppState {
  // Documents
  docA: ImportedSettingsDocument | null;
  docB: ImportedSettingsDocument | null;

  // Derived
  graph: IRGraph | null;
  analysisReport: AnalysisReport | null;
  comparisonResult: ComparisonResult | null;

  // Simulation
  simState: SimState | null;
  simRunning: boolean;
  simFocusedOutputId: string | null;
  simActivePaths: ActivePathRecord[];
  simInputFilter: string;
  simViewMode: SimViewMode;

  // SER events
  serEvents: SEREvent[];

  // UI state
  activePanel: AppPanel;
  selectedNodeId: string | null;
  highlightedNodeIds: Set<string>;
  hiddenNodeIds: Set<string>;
  showUnusedOverlay: boolean;
  colorMode: ColorMode;

  // Actions
  setSerEvents: (events: SEREvent[]) => void;
  setDocA: (doc: ImportedSettingsDocument) => void;
  setDocB: (doc: ImportedSettingsDocument) => void;
  setGraph: (g: IRGraph) => void;
  setAnalysisReport: (r: AnalysisReport) => void;
  setComparisonResult: (r: ComparisonResult) => void;
  setSimState: (s: SimState) => void;
  setSimRunning: (v: boolean) => void;
  setSimFocusedOutputId: (id: string | null) => void;
  setSimActivePaths: (paths: ActivePathRecord[]) => void;
  setSimInputFilter: (filter: string) => void;
  setSimViewMode: (mode: SimViewMode) => void;
  setActivePanel: (p: AppPanel) => void;
  setSelectedNodeId: (id: string | null) => void;
  setHighlightedNodeIds: (ids: Set<string>) => void;
  hideNode: (id: string) => void;
  clearHiddenNodes: () => void;
  toggleUnusedOverlay: () => void;
  toggleColorMode: () => void;
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
  simFocusedOutputId: null,
  simActivePaths: [],
  simInputFilter: '',
  simViewMode: 'expanded',
  serEvents: [],
  activePanel: 'import',
  selectedNodeId: null,
  highlightedNodeIds: new Set(),
  hiddenNodeIds: new Set(),
  showUnusedOverlay: false,
  colorMode: 'dark',

  setSerEvents: (serEvents) => set({ serEvents }),
  setDocA: (docA) => set({ docA }),
  setDocB: (docB) => set({ docB }),
  setGraph: (graph) => set({ graph }),
  setAnalysisReport: (analysisReport) => set({ analysisReport }),
  setComparisonResult: (comparisonResult) => set({ comparisonResult }),
  setSimState: (simState) => set({ simState }),
  setSimRunning: (simRunning) => set({ simRunning }),
  setSimFocusedOutputId: (simFocusedOutputId) => set({ simFocusedOutputId }),
  setSimActivePaths: (simActivePaths) => set({ simActivePaths }),
  setSimInputFilter: (simInputFilter) => set({ simInputFilter }),
  setSimViewMode: (simViewMode) => set({ simViewMode }),
  setActivePanel: (activePanel) => set({ activePanel }),
  setSelectedNodeId: (selectedNodeId) => set({ selectedNodeId }),
  setHighlightedNodeIds: (highlightedNodeIds) => set({ highlightedNodeIds }),
  hideNode: (id) => set((state) => {
    const next = new Set(state.hiddenNodeIds);
    next.add(id);
    return { hiddenNodeIds: next };
  }),
  clearHiddenNodes: () => set({ hiddenNodeIds: new Set() }),
  toggleUnusedOverlay: () => set((state) => ({ showUnusedOverlay: !state.showUnusedOverlay })),
  toggleColorMode: () => set((state) => ({
    colorMode: state.colorMode === 'dark' ? 'light' : 'dark',
  })),
  reset: () => set({
    docA: null, docB: null, graph: null, analysisReport: null,
    comparisonResult: null, simState: null, simRunning: false,
    simFocusedOutputId: null, simActivePaths: [], simInputFilter: '',
    selectedNodeId: null, highlightedNodeIds: new Set(),
  }),
}));
