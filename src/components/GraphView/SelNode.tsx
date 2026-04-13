import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { useAppStore } from '../../store/appStore';
import type { IRNodeKind, OutputClass } from '../../core/ir/types';
import type { TimerInfo } from '../../core/simulation/engine';

interface SelNodeData {
  label: string;
  kind: IRNodeKind;
  active: boolean;
  selected: boolean;
  highlighted: boolean;
  sourceValue?: string;
  // Simulation-enhanced fields
  causal: boolean;
  dimmed: boolean;
  latched: boolean;
  forced: boolean;
  timerInfo?: TimerInfo;
  outputClass?: OutputClass;
  changedThisStep: boolean;
}

// ─── Color scheme per kind ────────────────────────────────────────────────────

type ColorSet = Record<IRNodeKind, { fill: string; stroke: string; text: string }>;

const KIND_COLORS_DARK: ColorSet = {
  input:    { fill: '#1e2d45', stroke: '#4a7eb5', text: '#90b4e8' },
  output:   { fill: '#3a1a28', stroke: '#c0426a', text: '#f0a0c0' },
  derived:  { fill: '#1a2e24', stroke: '#3d8a5e', text: '#7ecaaa' },
  and:      { fill: '#252050', stroke: '#6860c0', text: '#b8b0f8' },
  or:       { fill: '#1e2a40', stroke: '#4870b0', text: '#90b0e8' },
  not:      { fill: '#3c2010', stroke: '#c06830', text: '#f0a870' },
  rising:   { fill: '#1a2e1a', stroke: '#50a050', text: '#90e090' },
  falling:  { fill: '#2e2a10', stroke: '#a09030', text: '#e8d870' },
  timer:    { fill: '#2a1a3c', stroke: '#8050b8', text: '#c8a0f0' },
  latch:    { fill: '#3a2010', stroke: '#b07030', text: '#e8c070' },
  pulse:    { fill: '#102e2e', stroke: '#309090', text: '#70e0e0' },
  function: { fill: '#282828', stroke: '#787878', text: '#c0c0c0' },
  numeric:  { fill: '#202020', stroke: '#484848', text: '#808080' },
};

const KIND_COLORS_LIGHT: ColorSet = {
  input:    { fill: '#dbeafe', stroke: '#2563eb', text: '#1e40af' },
  output:   { fill: '#fce7f3', stroke: '#db2777', text: '#9d174d' },
  derived:  { fill: '#dcfce7', stroke: '#16a34a', text: '#166534' },
  and:      { fill: '#ede9fe', stroke: '#7c3aed', text: '#5b21b6' },
  or:       { fill: '#dbeafe', stroke: '#3b82f6', text: '#1e3a8a' },
  not:      { fill: '#ffedd5', stroke: '#ea580c', text: '#9a3412' },
  rising:   { fill: '#dcfce7', stroke: '#22c55e', text: '#166534' },
  falling:  { fill: '#fef9c3', stroke: '#ca8a04', text: '#854d0e' },
  timer:    { fill: '#f3e8ff', stroke: '#9333ea', text: '#6b21a8' },
  latch:    { fill: '#ffedd5', stroke: '#ea580c', text: '#9a3412' },
  pulse:    { fill: '#ccfbf1', stroke: '#0d9488', text: '#115e59' },
  function: { fill: '#f1f5f9', stroke: '#64748b', text: '#334155' },
  numeric:  { fill: '#f1f5f9', stroke: '#94a3b8', text: '#64748b' },
};

function getColors(kind: IRNodeKind, active: boolean, selected: boolean, highlighted: boolean, theme: 'dark' | 'light' = 'dark') {
  const palette = theme === 'light' ? KIND_COLORS_LIGHT : KIND_COLORS_DARK;
  const base = palette[kind] ?? palette.function;
  if (active) {
    return theme === 'light'
      ? { fill: '#bbf7d0', stroke: '#16a34a', text: '#166534' }
      : { fill: '#0f2a0f', stroke: '#4ade80', text: '#4ade80' };
  }
  if (selected) {
    return theme === 'light'
      ? { fill: base.fill, stroke: '#ca8a04', text: '#854d0e' }
      : { fill: base.fill, stroke: '#facc15', text: '#facc15' };
  }
  if (highlighted) {
    return theme === 'light'
      ? { fill: base.fill, stroke: '#3b82f6', text: base.text }
      : { fill: base.fill, stroke: '#60a5fa', text: base.text };
  }
  return base;
}

// ─── Output class labels ────────────────────────────────────────────────────

const OUTPUT_CLASS_LABELS: Record<OutputClass, { text: string; color: string }> = {
  trip: { text: 'TRIP', color: '#ef4444' },
  close: { text: 'CLOSE', color: '#3b82f6' },
  alarm: { text: 'ALARM', color: '#f59e0b' },
  breaker_failure: { text: 'BF', color: '#ef4444' },
  reclose: { text: 'RECLOSE', color: '#8b5cf6' },
  block: { text: 'BLOCK', color: '#6b7280' },
  display: { text: 'DISP', color: '#06b6d4' },
  led: { text: 'LED', color: '#22d3ee' },
  supervisory: { text: 'SUPV', color: '#a78bfa' },
  other: { text: 'OUT', color: '#9ca3af' },
};

// ─── Badge components ───────────────────────────────────────────────────────

function ForcedBadge() {
  return (
    <div style={{
      position: 'absolute', top: -6, right: -6, zIndex: 10,
      width: 16, height: 16, borderRadius: '50%',
      background: '#f59e0b', color: '#000',
      fontSize: 10, fontWeight: 900, fontFamily: 'monospace',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: '1.5px solid #fbbf24',
      boxShadow: '0 0 4px rgba(245,158,11,0.6)',
    }}>
      F
    </div>
  );
}

function LatchedBadge() {
  return (
    <div style={{
      position: 'absolute', top: -6, left: -6, zIndex: 10,
      width: 16, height: 16, borderRadius: '50%',
      background: '#d97706', color: '#000',
      fontSize: 9, fontWeight: 900,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: '1.5px solid #fbbf24',
    }} title="Latched ON">
      L
    </div>
  );
}

function OutputClassBadge({ outputClass }: { outputClass: OutputClass }) {
  const info = OUTPUT_CLASS_LABELS[outputClass];
  return (
    <div style={{
      position: 'absolute', bottom: -14, left: '50%', transform: 'translateX(-50%)',
      fontSize: 8, fontWeight: 800, fontFamily: 'monospace',
      color: info.color, letterSpacing: '0.05em',
      textShadow: '0 1px 2px rgba(0,0,0,0.8)',
      whiteSpace: 'nowrap',
    }}>
      {info.text}
    </div>
  );
}

function TimerProgressBar({ timerInfo }: { timerInfo: TimerInfo }) {
  const { state, currentTicks, thresholdTicks } = timerInfo;
  const fraction = thresholdTicks > 0 ? Math.min(currentTicks / thresholdTicks, 1) : 0;

  const stateColors: Record<string, string> = {
    idle: '#4b5563',
    timing: '#3b82f6',
    qualified: '#22c55e',
    reset: '#ef4444',
  };
  const barColor = stateColors[state] ?? '#4b5563';
  const stateLabel = state === 'qualified' ? 'QUAL' : state.toUpperCase();

  return (
    <div style={{
      position: 'absolute', bottom: -18, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', alignItems: 'center', gap: 3,
      whiteSpace: 'nowrap',
    }}>
      {/* Progress bar */}
      <div style={{
        width: 36, height: 5, background: '#1f2937', borderRadius: 2,
        overflow: 'hidden', border: '1px solid #374151',
      }}>
        <div style={{
          width: `${fraction * 100}%`, height: '100%',
          background: barColor, borderRadius: 2,
          transition: 'width 0.15s ease',
        }} />
      </div>
      {/* Tick count */}
      <span style={{
        fontSize: 7, fontFamily: 'monospace', fontWeight: 700,
        color: barColor,
      }}>
        {currentTicks}/{thresholdTicks}
      </span>
      {/* State label */}
      <span style={{
        fontSize: 6, fontFamily: 'monospace', fontWeight: 700,
        color: barColor, opacity: 0.8,
      }}>
        {stateLabel}
      </span>
    </div>
  );
}

// ─── Changed-output flash keyframes (injected once) ─────────────────────────

const FLASH_STYLE_ID = 'sel-node-flash-style';
if (typeof document !== 'undefined' && !document.getElementById(FLASH_STYLE_ID)) {
  const style = document.createElement('style');
  style.id = FLASH_STYLE_ID;
  style.textContent = `
    @keyframes sel-output-flash {
      0% { box-shadow: 0 0 0 0 rgba(250,204,21,0.8); }
      50% { box-shadow: 0 0 14px 4px rgba(250,204,21,0.6); }
      100% { box-shadow: 0 0 0 0 rgba(250,204,21,0); }
    }
  `;
  document.head.appendChild(style);
}

// ─── AND gate (IEEE Std 91: flat left, D-curve right) ────────────────────────
// Node: 76x46
function AndGateShape({ c }: { c: ReturnType<typeof getColors> }) {
  return (
    <svg width="76" height="46" viewBox="0 0 76 46" style={{ display: 'block' }}>
      <path
        d="M 6,4 L 6,42 C 52,42 68,34 68,23 C 68,12 52,4 6,4 Z"
        fill={c.fill} stroke={c.stroke} strokeWidth="2"
      />
      <line x1="68" y1="23" x2="76" y2="23" stroke={c.stroke} strokeWidth="1.5" />
    </svg>
  );
}

// ─── OR gate (IEEE Std 91: concave left, pointed right) ──────────────────────
// Node: 76x46
function OrGateShape({ c }: { c: ReturnType<typeof getColors> }) {
  return (
    <svg width="76" height="46" viewBox="0 0 76 46" style={{ display: 'block' }}>
      <path
        d="M 6,4 Q 18,23 6,42 Q 28,42 56,23 Q 28,4 6,4 Z"
        fill={c.fill} stroke={c.stroke} strokeWidth="2"
      />
      <line x1="56" y1="23" x2="76" y2="23" stroke={c.stroke} strokeWidth="1.5" />
    </svg>
  );
}

// ─── NOT gate / inverter (IEEE Std 91: triangle + bubble) ────────────────────
// Node: 64x42
function NotGateShape({ c }: { c: ReturnType<typeof getColors> }) {
  return (
    <svg width="64" height="42" viewBox="0 0 64 42" style={{ display: 'block' }}>
      <path d="M 4,4 L 4,38 L 46,21 Z"
        fill={c.fill} stroke={c.stroke} strokeWidth="2"
      />
      <circle cx="52" cy="21" r="6" fill={c.fill} stroke={c.stroke} strokeWidth="2" />
      <line x1="58" y1="21" x2="64" y2="21" stroke={c.stroke} strokeWidth="1.5" />
      <text x="20" y="25" textAnchor="middle" fontSize="12" fontWeight="bold"
            fontFamily="monospace" fill={c.text}>1</text>
    </svg>
  );
}

// ─── Timer (IEEE: rectangle with clock annotation, PU/DO corners) ────────────
// Node: 100x52
function TimerShape({ c, label }: { c: ReturnType<typeof getColors>; label: string }) {
  return (
    <svg width="100" height="52" viewBox="0 0 100 52" style={{ display: 'block' }}>
      <rect x="4" y="4" width="86" height="44" rx="3"
        fill={c.fill} stroke={c.stroke} strokeWidth="2"
      />
      <circle cx="78" cy="15" r="6" fill="none" stroke={c.stroke} strokeWidth="1" opacity="0.6" />
      <line x1="78" y1="15" x2="78" y2="11" stroke={c.stroke} strokeWidth="1" opacity="0.6" />
      <line x1="78" y1="15" x2="81" y2="15" stroke={c.stroke} strokeWidth="1" opacity="0.6" />
      <text x="40" y="22" textAnchor="middle" fontSize="11" fontWeight="bold"
            fontFamily="monospace" fill={c.text}>{label}</text>
      <text x="18" y="42" textAnchor="middle" fontSize="8" fontFamily="monospace"
            fill={c.stroke} opacity="0.7">PU</text>
      <text x="66" y="42" textAnchor="middle" fontSize="8" fontFamily="monospace"
            fill={c.stroke} opacity="0.7">DO</text>
      <line x1="0" y1="26" x2="4" y2="26" stroke={c.stroke} strokeWidth="1.5" />
      <line x1="90" y1="26" x2="100" y2="26" stroke={c.stroke} strokeWidth="1.5" />
    </svg>
  );
}

// ─── Latch / SR Flip-Flop (IEEE: rectangle with S/R inputs, Q output) ───────
// Node: 90x56
function LatchShape({ c, label }: { c: ReturnType<typeof getColors>; label: string }) {
  const isSet = label === 'SET' || label === 'S';
  return (
    <svg width="90" height="56" viewBox="0 0 90 56" style={{ display: 'block' }}>
      <rect x="4" y="4" width="76" height="48" rx="3"
        fill={c.fill} stroke={c.stroke} strokeWidth="2"
      />
      <text x="14" y="22" textAnchor="start" fontSize="10" fontWeight="bold"
            fontFamily="monospace" fill={isSet ? '#4ade80' : c.text}>S</text>
      <text x="14" y="44" textAnchor="start" fontSize="10" fontWeight="bold"
            fontFamily="monospace" fill={!isSet ? '#ef4444' : c.text}>R</text>
      <text x="70" y="30" textAnchor="end" fontSize="10" fontWeight="bold"
            fontFamily="monospace" fill={c.text}>Q</text>
      <text x="44" y="32" textAnchor="middle" fontSize="9" fontWeight="600"
            fontFamily="monospace" fill={c.stroke} opacity="0.7">LATCH</text>
      <line x1="28" y1="8" x2="28" y2="48" stroke={c.stroke} strokeWidth="0.5" opacity="0.3" />
      <line x1="0" y1="18" x2="4" y2="18" stroke={c.stroke} strokeWidth="1.5" />
      <line x1="0" y1="40" x2="4" y2="40" stroke={c.stroke} strokeWidth="1.5" />
      <line x1="80" y1="28" x2="90" y2="28" stroke={c.stroke} strokeWidth="1.5" />
    </svg>
  );
}

// ─── Rising Edge Trigger ────────────────────────────────────────────────────
// Node: 80x42
function RisingEdgeShape({ c }: { c: ReturnType<typeof getColors> }) {
  return (
    <svg width="80" height="42" viewBox="0 0 80 42" style={{ display: 'block' }}>
      <rect x="4" y="4" width="66" height="34" rx="3"
        fill={c.fill} stroke={c.stroke} strokeWidth="2"
      />
      <polyline points="14,28 14,14 26,14" fill="none"
        stroke={c.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      />
      <polyline points="12,18 14,13 16,18" fill="none"
        stroke={c.text} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      />
      <text x="48" y="25" textAnchor="middle" fontSize="9" fontWeight="bold"
            fontFamily="monospace" fill={c.text}>R_TRIG</text>
      <line x1="0" y1="21" x2="4" y2="21" stroke={c.stroke} strokeWidth="1.5" />
      <line x1="70" y1="21" x2="80" y2="21" stroke={c.stroke} strokeWidth="1.5" />
    </svg>
  );
}

// ─── Falling Edge Trigger ───────────────────────────────────────────────────
// Node: 80x42
function FallingEdgeShape({ c }: { c: ReturnType<typeof getColors> }) {
  return (
    <svg width="80" height="42" viewBox="0 0 80 42" style={{ display: 'block' }}>
      <rect x="4" y="4" width="66" height="34" rx="3"
        fill={c.fill} stroke={c.stroke} strokeWidth="2"
      />
      <polyline points="14,14 14,28 26,28" fill="none"
        stroke={c.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      />
      <polyline points="12,24 14,29 16,24" fill="none"
        stroke={c.text} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      />
      <text x="48" y="25" textAnchor="middle" fontSize="9" fontWeight="bold"
            fontFamily="monospace" fill={c.text}>F_TRIG</text>
      <line x1="0" y1="21" x2="4" y2="21" stroke={c.stroke} strokeWidth="1.5" />
      <line x1="70" y1="21" x2="80" y2="21" stroke={c.stroke} strokeWidth="1.5" />
    </svg>
  );
}

// ─── Pulse (one-shot) ────────────────────────────────────────────────────────
// Node: 80x42
function PulseShape({ c }: { c: ReturnType<typeof getColors> }) {
  return (
    <svg width="80" height="42" viewBox="0 0 80 42" style={{ display: 'block' }}>
      <rect x="4" y="4" width="66" height="34" rx="3"
        fill={c.fill} stroke={c.stroke} strokeWidth="2"
      />
      <polyline points="14,28 14,14 22,14 22,28" fill="none"
        stroke={c.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      />
      <text x="48" y="25" textAnchor="middle" fontSize="9" fontWeight="bold"
            fontFamily="monospace" fill={c.text}>PULSE</text>
      <line x1="0" y1="21" x2="4" y2="21" stroke={c.stroke} strokeWidth="1.5" />
      <line x1="70" y1="21" x2="80" y2="21" stroke={c.stroke} strokeWidth="1.5" />
    </svg>
  );
}

// ─── Named node (input, output, derived, function) ──────────────────────────
const KIND_BADGE: Partial<Record<IRNodeKind, string>> = {
  input:   'IN',
  output:  'OUT',
  derived: 'DEF',
  function:'FN',
};

function NamedNodeShape({
  label, kind, c, sourceValue,
}: {
  label: string;
  kind: IRNodeKind;
  c: ReturnType<typeof getColors>;
  sourceValue?: string;
}) {
  const badge = KIND_BADGE[kind] ?? kind.toUpperCase().slice(0, 3);
  const maxLabel = label.length > 12 ? label.slice(0, 11) + '\u2026' : label;
  return (
    <div style={{
      background: c.fill,
      border: `2px solid ${c.stroke}`,
      borderRadius: 5,
      padding: '3px 8px 4px',
      minWidth: 80,
      maxWidth: 120,
      cursor: 'pointer',
    }}>
      <div style={{
        fontSize: 9,
        color: c.stroke,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        marginBottom: 1,
      }}>
        {badge}
      </div>
      <div style={{
        fontSize: 14,
        fontWeight: 800,
        color: c.text,
        fontFamily: 'monospace',
        letterSpacing: '0.02em',
        lineHeight: 1.1,
      }}>
        {maxLabel}
      </div>
      {sourceValue && kind !== 'input' && (
        <div style={{
          fontSize: 8,
          color: c.stroke,
          opacity: 0.8,
          marginTop: 2,
          fontFamily: 'monospace',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: 108,
        }}>
          ={sourceValue.slice(0, 22)}{sourceValue.length > 22 ? '\u2026' : ''}
        </div>
      )}
    </div>
  );
}

// ─── Wrapper with simulation overlays ────────────────────────────────────────

function NodeWrapper({
  data, children,
}: {
  data: SelNodeData;
  children: React.ReactNode;
}) {
  const colorMode = useAppStore((s) => s.colorMode);
  const c = getColors(data.kind, data.active, data.selected, data.highlighted, colorMode);
  const handleStyle = { background: c.stroke, width: 8, height: 8, border: `2px solid ${c.stroke}` };

  // Glow effects
  let glow = 'none';
  if (data.changedThisStep) {
    glow = 'none'; // flash animation handles it
  } else if (data.causal) {
    glow = '0 0 12px rgba(74,222,128,0.7)';
  } else if (data.active) {
    glow = '0 0 10px rgba(74,222,128,0.6)';
  } else if (data.selected) {
    glow = '0 0 8px rgba(250,204,21,0.5)';
  } else if (data.highlighted) {
    glow = '0 0 6px rgba(96,165,250,0.4)';
  }

  // Dimming for non-causal nodes during focus mode
  const opacity = data.dimmed ? 0.25 : 1;

  // Border override for forced inputs
  const forcedBorderStyle = data.forced
    ? { borderStyle: 'dashed' as const, borderColor: '#f59e0b', borderWidth: 2 }
    : {};

  // Latched double-border
  const latchedStyle = data.latched
    ? { outline: '2px solid #d97706', outlineOffset: '2px' }
    : {};

  // Changed flash animation
  const flashAnimation = data.changedThisStep
    ? { animation: 'sel-output-flash 0.6s ease-out' }
    : {};

  return (
    <div style={{
      position: 'relative',
      boxShadow: glow,
      borderRadius: 5,
      opacity,
      transition: 'opacity 0.2s ease',
      ...forcedBorderStyle,
      ...latchedStyle,
      ...flashAnimation,
    }}>
      {data.forced && <ForcedBadge />}
      {data.latched && <LatchedBadge />}
      <Handle type="target" position={Position.Left}
        style={{ ...handleStyle, top: data.kind === 'latch' ? '32%' : '50%' }} />
      {children}
      <Handle type="source" position={Position.Right}
        style={{ ...handleStyle, top: '50%' }} />
      {data.outputClass && <OutputClassBadge outputClass={data.outputClass} />}
      {data.timerInfo && data.timerInfo.state !== 'idle' && (
        <TimerProgressBar timerInfo={data.timerInfo} />
      )}
    </div>
  );
}

// ─── Main exported node ───────────────────────────────────────────────────────

export const SelNode = memo(({ data }: { data: SelNodeData }) => {
  const colorMode = useAppStore((s) => s.colorMode);
  const c = getColors(data.kind, data.active, data.selected, data.highlighted, colorMode);

  // AND gate
  if (data.kind === 'and') {
    return <NodeWrapper data={data}><AndGateShape c={c} /></NodeWrapper>;
  }

  // OR gate
  if (data.kind === 'or') {
    return <NodeWrapper data={data}><OrGateShape c={c} /></NodeWrapper>;
  }

  // NOT / inverter
  if (data.kind === 'not') {
    return <NodeWrapper data={data}><NotGateShape c={c} /></NodeWrapper>;
  }

  // Timer
  if (data.kind === 'timer') {
    return <NodeWrapper data={data}><TimerShape c={c} label={data.label} /></NodeWrapper>;
  }

  // Latch
  if (data.kind === 'latch') {
    return <NodeWrapper data={data}><LatchShape c={c} label={data.label} /></NodeWrapper>;
  }

  // Rising edge trigger
  if (data.kind === 'rising') {
    return <NodeWrapper data={data}><RisingEdgeShape c={c} /></NodeWrapper>;
  }

  // Falling edge trigger
  if (data.kind === 'falling') {
    return <NodeWrapper data={data}><FallingEdgeShape c={c} /></NodeWrapper>;
  }

  // Pulse
  if (data.kind === 'pulse') {
    return <NodeWrapper data={data}><PulseShape c={c} /></NodeWrapper>;
  }

  // Named nodes (input, output, derived, function)
  return (
    <NodeWrapper data={data}>
      <NamedNodeShape label={data.label} kind={data.kind} c={c} sourceValue={data.sourceValue} />
    </NodeWrapper>
  );
});

SelNode.displayName = 'SelNode';
