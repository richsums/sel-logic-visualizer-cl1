import React from 'react';
import { useAppStore } from '../../store/appStore';
import { traceNode, findPaths, detectCycles, detectUnused } from '../../core/analysis/engine';
import styles from './AnalysisSidebar.module.css';

export function AnalysisSidebar() {
  const { graph, docA, selectedNodeId, analysisReport } = useAppStore();

  if (!graph || !docA) {
    return <div className={styles.empty}>Import settings to see analysis.</div>;
  }

  const selectedNode = selectedNodeId ? graph.nodes.get(selectedNodeId) : null;
  const trace = selectedNodeId ? traceNode(graph, selectedNodeId) : null;
  const paths = selectedNodeId ? findPaths(graph, selectedNodeId) : [];

  return (
    <div className={styles.panel}>
      <h3 className={styles.title}>Analysis</h3>

      {/* Selected node section */}
      {selectedNode ? (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Selected: <code>{selectedNode.label}</code></div>
          <div className={styles.meta}>Type: {selectedNode.kind}</div>
          {selectedNode.sourceRawValue && (
            <div className={styles.rawValue}>
              <span className={styles.rawLabel}>Value:</span>
              <code>{selectedNode.sourceRawValue}</code>
            </div>
          )}

          {trace && (
            <>
              <div className={styles.subTitle}>Upstream ({trace.upstream.size})</div>
              <div className={styles.tagList}>
                {[...trace.upstream].slice(0, 30).map(id => (
                  <span key={id} className={styles.tag}>{id}</span>
                ))}
                {trace.upstream.size > 30 && <span className={styles.more}>+{trace.upstream.size - 30} more</span>}
              </div>

              <div className={styles.subTitle}>Downstream ({trace.downstream.size})</div>
              <div className={styles.tagList}>
                {[...trace.downstream].slice(0, 20).map(id => (
                  <span key={id} className={`${styles.tag} ${styles.tagDown}`}>{id}</span>
                ))}
                {trace.downstream.size > 20 && <span className={styles.more}>+{trace.downstream.size - 20} more</span>}
              </div>
            </>
          )}

          {paths.length > 0 && (
            <>
              <div className={styles.subTitle}>Input paths ({paths.length})</div>
              <div className={styles.pathList}>
                {paths.slice(0, 5).map((path, i) => (
                  <div key={i} className={styles.path}>
                    {path.join(' → ')}
                  </div>
                ))}
                {paths.length > 5 && <div className={styles.more}>+{paths.length - 5} more paths</div>}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className={styles.hint}>Click any node in the graph to trace dependencies and paths.</div>
      )}

      {/* Report section */}
      {analysisReport && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Diagnostics</div>

          <div className={`${styles.reportRow} ${analysisReport.cycles.length > 0 ? styles.bad : styles.good}`}>
            <span>Cycles</span>
            <span>{analysisReport.cycles.length}</span>
          </div>
          {analysisReport.cycles.map((cycle, i) => (
            <div key={i} className={styles.cycleRow}>{cycle.join(' → ')} → …</div>
          ))}

          <div className={`${styles.reportRow} ${analysisReport.undefinedIdents.length > 0 ? styles.warn : styles.good}`}>
            <span>Undefined refs</span>
            <span>{analysisReport.undefinedIdents.length}</span>
          </div>
          {analysisReport.undefinedIdents.map(id => (
            <div key={id} className={styles.undef}>{id}</div>
          ))}

          <div className={`${styles.reportRow} ${analysisReport.unusedNodes.length > 0 ? styles.warn : styles.good}`}>
            <span>Unused settings</span>
            <span>{analysisReport.unusedNodes.length}</span>
          </div>
          {analysisReport.unusedNodes.slice(0, 10).map(id => (
            <div key={id} className={styles.unused}>{id}</div>
          ))}
        </div>
      )}

      {/* Settings summary */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Settings summary</div>
        <div className={styles.reportRow}>
          <span>Total settings</span>
          <span>{docA.settings.length}</span>
        </div>
        <div className={styles.reportRow}>
          <span>Element settings</span>
          <span>{graph.elementSettingNames.length}</span>
        </div>
        <div className={styles.reportRow}>
          <span>Logic settings</span>
          <span>{graph.logicSettingNames.length}</span>
        </div>
        <div className={styles.reportRow}>
          <span>Global settings</span>
          <span>{graph.globalSettingNames.length}</span>
        </div>
        <div className={styles.reportRow}>
          <span>Graph nodes</span>
          <span>{graph.nodes.size}</span>
        </div>
        <div className={styles.reportRow}>
          <span>Graph edges</span>
          <span>{graph.edges.length}</span>
        </div>
      </div>
    </div>
  );
}
