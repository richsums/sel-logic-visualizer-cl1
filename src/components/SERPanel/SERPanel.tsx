import React, { useState, useRef, useCallback, useMemo } from 'react';
import { useAppStore } from '../../store/appStore';
import type { IRGraph } from '../../core/ir/types';
import {
  parseSERText,
  groupEventsByBurst,
  formatRelMs,
  type SEREvent,
  type ElementClass,
} from '../../core/ser/parser';
import { traceUpstream, traceDownstream } from '../../core/analysis/engine';
import styles from './SERPanel.module.css';

// ─── Element class metadata ───────────────────────────────────────────────────

interface ClassMeta {
  label: string;
  dotClass: string;
  badgeClass: string;
  filterClass: string;
}

const CLASS_META: Record<ElementClass, ClassMeta> = {
  protection:   { label: 'Protection', dotClass: styles.classProtection,  badgeClass: styles.classBadgeProtection,  filterClass: styles.classProtection  },
  timer:        { label: 'Timer',      dotClass: styles.classTimer,       badgeClass: styles.classBadgeTimer,       filterClass: styles.classTimer       },
  output:       { label: 'Output',     dotClass: styles.classOutput,      badgeClass: styles.classBadgeOutput,      filterClass: styles.classOutput      },
  input:        { label: 'Input',      dotClass: styles.classInput,       badgeClass: styles.classBadgeInput,       filterClass: styles.classInput       },
  latch:        { label: 'Latch',      dotClass: styles.classLatch,       badgeClass: styles.classBadgeLatch,       filterClass: styles.classLatch       },
  variable:     { label: 'Variable',   dotClass: styles.classVariable,    badgeClass: styles.classBadgeVariable,    filterClass: styles.classVariable    },
  breaker:      { label: 'Breaker',    dotClass: styles.classBreaker,     badgeClass: styles.classBadgeBreaker,     filterClass: styles.classBreaker     },
  reclose:      { label: 'Reclose',    dotClass: styles.classReclose,     badgeClass: styles.classBadgeReclose,     filterClass: styles.classReclose     },
  breaker_fail: { label: 'BF',         dotClass: styles.classBreakerFail, badgeClass: styles.classBadgeBreakerFail, filterClass: styles.classBreakerFail },
  unknown:      { label: 'Other',      dotClass: styles.classUnknown,     badgeClass: styles.classBadgeUnknown,     filterClass: styles.classUnknown     },
};

const ALL_CLASSES = Object.keys(CLASS_META) as ElementClass[];

// ─── Main component ───────────────────────────────────────────────────────────

export function SERPanel() {
  const {
    graph,
    serEvents, setSerEvents,
    setActivePanel, setSelectedNodeId, setHighlightedNodeIds,
  } = useAppStore();

  const [warnings, setWarnings] = useState<string[]>([]);
  const [parseInfo, setParseInfo] = useState<{ total: number; skipped: number } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [filter, setFilter] = useState('');
  const [activeClasses, setActiveClasses] = useState<Set<ElementClass>>(new Set(ALL_CLASSES));
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── File handling ──────────────────────────────────────────────────────

  const processFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const result = parseSERText(text);
      setSerEvents(result.events);
      setWarnings(result.warnings);
      setParseInfo({ total: result.totalLines, skipped: result.skippedLines });
    };
    reader.readAsText(file);
  }, [setSerEvents]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  }, [processFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragOver(false), []);

  const handleClear = useCallback(() => {
    setSerEvents([]);
    setWarnings([]);
    setParseInfo(null);
  }, [setSerEvents]);

  // ─── View element in graph ──────────────────────────────────────────────

  const viewInGraph = useCallback((elementId: string) => {
    if (!graph) return;

    // Find the node in the graph
    const node = graph.nodes.get(elementId);
    if (!node) {
      // Try case-insensitive search
      let foundId: string | null = null;
      for (const [id] of graph.nodes) {
        if (id.toUpperCase() === elementId.toUpperCase()) { foundId = id; break; }
      }
      if (!foundId) {
        // No direct match: just navigate to graph with the ID selected
        setSelectedNodeId(elementId);
        setHighlightedNodeIds(new Set([elementId]));
        setActivePanel('graph');
        return;
      }
      viewInGraph(foundId);
      return;
    }

    // Trace upstream + downstream for the node to highlight its logic cone
    const upstream = traceUpstream(graph, elementId);
    const downstream = traceDownstream(graph, elementId);
    const highlighted = new Set([...upstream, elementId, ...downstream]);

    setHighlightedNodeIds(highlighted);
    setSelectedNodeId(elementId);
    setActivePanel('graph');
  }, [graph, setActivePanel, setSelectedNodeId, setHighlightedNodeIds]);

  // ─── Class filter toggle ────────────────────────────────────────────────

  const toggleClass = useCallback((cls: ElementClass) => {
    setActiveClasses(prev => {
      const next = new Set(prev);
      if (next.has(cls)) {
        if (next.size === 1) return prev; // keep at least one
        next.delete(cls);
      } else {
        next.add(cls);
      }
      return next;
    });
  }, []);

  // ─── Filtering ──────────────────────────────────────────────────────────

  const filteredEvents = useMemo(() => {
    const f = filter.toUpperCase().trim();
    return serEvents.filter(ev => {
      if (!activeClasses.has(ev.elementClass)) return false;
      if (f && !ev.elementId.includes(f) && !ev.description.toUpperCase().includes(f)) return false;
      return true;
    });
  }, [serEvents, filter, activeClasses]);

  const bursts = useMemo(() => groupEventsByBurst(filteredEvents), [filteredEvents]);

  // ─── Summary ────────────────────────────────────────────────────────────

  const uniqueElements = useMemo(() => {
    const s = new Set<string>();
    for (const ev of serEvents) s.add(ev.elementId);
    return s.size;
  }, [serEvents]);

  const timeSpan = useMemo(() => {
    if (serEvents.length < 2) return null;
    const first = serEvents[0];
    const last = serEvents[serEvents.length - 1];
    if (first.absoluteMs > 0 && last.absoluteMs > 0) {
      const ms = last.absoluteMs - first.absoluteMs;
      if (ms < 1000) return `${ms.toFixed(1)}ms`;
      return `${(ms / 1000).toFixed(3)}s`;
    }
    return null;
  }, [serEvents]);

  // ─── Render: empty / upload state ──────────────────────────────────────

  if (serEvents.length === 0) {
    return (
      <div className={styles.panel}>
        <div className={styles.header}>
          <h3 className={styles.title}>SER Timeline</h3>
        </div>
        <div className={styles.uploadArea}>
          <div
            className={`${styles.dropZone} ${isDragOver ? styles.dropZoneActive : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className={styles.dropIcon}>📋</div>
            <div className={styles.dropTitle}>Upload SEL SER File</div>
            <div className={styles.dropSub}>
              Drag and drop your SER export (.txt) here,<br/>or click to browse
            </div>
            <button
              className={styles.browseBtn}
              onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}
            >
              Browse…
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.csv,.log"
            className={styles.fileInput}
            onChange={handleFileChange}
          />
          <p className={styles.formatNote}>
            Supports AcSELerator Quickset SER exports, SEL relay .txt SER files,
            tab-separated or comma-separated formats.
          </p>
          {warnings.map((w, i) => (
            <div key={i} className={styles.warnBanner}>{w}</div>
          ))}
        </div>
      </div>
    );
  }

  // ─── Render: timeline ───────────────────────────────────────────────────

  return (
    <div className={styles.panel}>
      {/* Header */}
      <div className={styles.header}>
        <h3 className={styles.title}>SER Timeline</h3>
        <div className={styles.headerActions}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.csv,.log"
            className={styles.fileInput}
            onChange={handleFileChange}
          />
          <button className={styles.btn} onClick={() => fileInputRef.current?.click()}>
            Load New File
          </button>
          <button className={`${styles.btn} ${styles.btnDanger}`} onClick={handleClear}>
            Clear
          </button>
        </div>
      </div>

      {/* Warnings */}
      {warnings.map((w, i) => (
        <div key={i} className={styles.warnBanner}>⚠ {w}</div>
      ))}

      {/* Summary bar */}
      <div className={styles.summaryBar}>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Events:</span>
          <span className={styles.summaryValue}>{serEvents.length}</span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Elements:</span>
          <span className={styles.summaryValue}>{uniqueElements}</span>
        </div>
        {timeSpan && (
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Span:</span>
            <span className={styles.summaryValue}>{timeSpan}</span>
          </div>
        )}
        {parseInfo && (
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Parsed:</span>
            <span className={styles.summaryValue}>
              {parseInfo.total - parseInfo.skipped}/{parseInfo.total} lines
            </span>
          </div>
        )}
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Showing:</span>
          <span className={styles.summaryValue}>{filteredEvents.length}</span>
        </div>
      </div>

      {/* Toolbar: filter + class chips */}
      <div className={styles.toolbar}>
        <input
          type="text"
          className={styles.filterInput}
          placeholder="Filter by element ID or description…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
        <div className={styles.classFilter}>
          {ALL_CLASSES.filter(cls => serEvents.some(ev => ev.elementClass === cls)).map(cls => {
            const meta = CLASS_META[cls];
            const count = serEvents.filter(ev => ev.elementClass === cls).length;
            return (
              <span
                key={cls}
                className={`${styles.classChip} ${meta.badgeClass} ${activeClasses.has(cls) ? styles.active : ''}`}
                onClick={() => toggleClass(cls)}
                title={`${meta.label} (${count})`}
              >
                {meta.label}
              </span>
            );
          })}
        </div>
      </div>

      {/* Timeline */}
      <div className={styles.timelineContainer}>
        {filteredEvents.length === 0 ? (
          <div className={styles.noData}>No events match the current filter.</div>
        ) : (
          bursts.map((burst, bi) => (
            <BurstGroup
              key={bi}
              burst={burst}
              isLast={bi === bursts.length - 1}
              graph={graph}
              onViewInGraph={viewInGraph}
            />
          ))
        )}
      </div>

      {/* Legend */}
      <div className={styles.legend}>
        <span className={styles.legendTitle}>Classes:</span>
        {ALL_CLASSES.filter(cls => serEvents.some(ev => ev.elementClass === cls)).map(cls => (
          <span key={cls} className={`${styles.classChip} ${styles.active} ${CLASS_META[cls].badgeClass}`}>
            {CLASS_META[cls].label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Burst group component ────────────────────────────────────────────────────

function BurstGroup({
  burst,
  isLast,
  graph,
  onViewInGraph,
}: {
  burst: SEREvent[];
  isLast: boolean;
  graph: IRGraph | null;
  onViewInGraph: (id: string) => void;
}) {
  const first = burst[0];
  return (
    <div className={styles.burstGroup}>
      <div className={styles.burstHeader}>
        <span className={styles.burstTime}>{first.timestampDisplay}</span>
        <span className={styles.burstLine} />
        {burst.length > 1 && (
          <span className={styles.burstCount}>{burst.length} events</span>
        )}
      </div>
      {burst.map((ev, i) => (
        <EventRow
          key={ev.index}
          event={ev}
          isLast={i === burst.length - 1 && isLast}
          graphHasNode={graph ? graph.nodes.has(ev.elementId) || hasNodeCaseInsensitive(graph, ev.elementId) : false}
          onViewInGraph={onViewInGraph}
        />
      ))}
    </div>
  );
}

function hasNodeCaseInsensitive(graph: IRGraph, id: string): boolean {
  const upper = id.toUpperCase();
  for (const [nodeId] of graph.nodes) {
    if (nodeId.toUpperCase() === upper) return true;
  }
  return false;
}

// ─── Event row component ──────────────────────────────────────────────────────

function EventRow({
  event,
  isLast,
  graphHasNode,
  onViewInGraph,
}: {
  event: SEREvent;
  isLast: boolean;
  graphHasNode: boolean;
  onViewInGraph: (id: string) => void;
}) {
  const meta = CLASS_META[event.elementClass];

  return (
    <div className={styles.eventRow}>
      {/* Spine: dot + line */}
      <div className={styles.eventSpine}>
        <div
          className={`${styles.eventDot} ${event.state === 'asserted' ? styles.asserted : styles.deasserted} ${meta.dotClass}`}
        />
        {!isLast && <div className={styles.eventSpineLine} />}
      </div>

      {/* Timestamp */}
      <div className={styles.eventTime}>
        <div className={styles.eventTimeMain}>{event.time}</div>
        {event.timestampMs > 0 && (
          <div className={styles.eventTimeRel}>{formatRelMs(event.timestampMs)}</div>
        )}
      </div>

      {/* Content */}
      <div className={styles.eventContent}>
        <div className={styles.eventTopRow}>
          <span className={styles.eventId}>{event.elementId}</span>
          <span className={`${styles.eventStateBadge} ${event.state === 'asserted' ? styles.stateBadgeAsserted : styles.stateBadgeDeasserted}`}>
            {event.rawState}
          </span>
          <span className={`${styles.classBadge} ${meta.badgeClass}`}>
            {meta.label}
          </span>
          {graphHasNode && (
            <button
              className={styles.eventGraphBtn}
              onClick={() => onViewInGraph(event.elementId)}
              title={`View ${event.elementId} logic in graph`}
            >
              View in Graph
            </button>
          )}
        </div>
        <div className={styles.eventDesc}>{event.description}</div>
      </div>
    </div>
  );
}
