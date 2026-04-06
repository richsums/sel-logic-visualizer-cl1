import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { IRNodeKind } from '../../core/ir/types';

interface SelNodeData {
  label: string;
  kind: IRNodeKind;
  active: boolean;
  selected: boolean;
  highlighted: boolean;
  sourceValue?: string;
}

// ─── Color scheme per kind ────────────────────────────────────────────────────

const KIND_COLORS: Record<IRNodeKind, { fill: string; stroke: string; text: string }> = {
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

function getColors(kind: IRNodeKind, active: boolean, selected: boolean, highlighted: boolean) {
  const base = KIND_COLORS[kind] ?? KIND_COLORS.function;
  if (active) return { fill: '#0f2a0f', stroke: '#4ade80', text: '#4ade80' };
  if (selected) return { fill: base.fill, stroke: '#facc15', text: '#facc15' };
  if (highlighted) return { fill: base.fill, stroke: '#60a5fa', text: base.text };
  return base;
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
      <text x="30" y="27" textAnchor="middle" fontSize="13" fontWeight="bold"
            fontFamily="monospace" fill={c.text}>&amp;</text>
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
      <text x="28" y="27" textAnchor="middle" fontSize="11" fontWeight="bold"
            fontFamily="monospace" fill={c.text}>≥1</text>
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
// Node: 100x52. Rectangle with timing notation.
function TimerShape({ c, label }: { c: ReturnType<typeof getColors>; label: string }) {
  return (
    <svg width="100" height="52" viewBox="0 0 100 52" style={{ display: 'block' }}>
      {/* Main rectangle */}
      <rect x="4" y="4" width="86" height="44" rx="3"
        fill={c.fill} stroke={c.stroke} strokeWidth="2"
      />
      {/* Clock/timer icon in top-right */}
      <circle cx="78" cy="15" r="6" fill="none" stroke={c.stroke} strokeWidth="1" opacity="0.6" />
      <line x1="78" y1="15" x2="78" y2="11" stroke={c.stroke} strokeWidth="1" opacity="0.6" />
      <line x1="78" y1="15" x2="81" y2="15" stroke={c.stroke} strokeWidth="1" opacity="0.6" />
      {/* Label: function name (PCT, TON, TOF) */}
      <text x="40" y="22" textAnchor="middle" fontSize="11" fontWeight="bold"
            fontFamily="monospace" fill={c.text}>{label}</text>
      {/* PU/DO annotation */}
      <text x="18" y="42" textAnchor="middle" fontSize="8" fontFamily="monospace"
            fill={c.stroke} opacity="0.7">PU</text>
      <text x="66" y="42" textAnchor="middle" fontSize="8" fontFamily="monospace"
            fill={c.stroke} opacity="0.7">DO</text>
      {/* Input/output stubs */}
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
      {/* Main rectangle */}
      <rect x="4" y="4" width="76" height="48" rx="3"
        fill={c.fill} stroke={c.stroke} strokeWidth="2"
      />
      {/* S input label */}
      <text x="14" y="22" textAnchor="start" fontSize="10" fontWeight="bold"
            fontFamily="monospace" fill={isSet ? '#4ade80' : c.text}>S</text>
      {/* R input label */}
      <text x="14" y="44" textAnchor="start" fontSize="10" fontWeight="bold"
            fontFamily="monospace" fill={!isSet ? '#ef4444' : c.text}>R</text>
      {/* Q output */}
      <text x="70" y="30" textAnchor="end" fontSize="10" fontWeight="bold"
            fontFamily="monospace" fill={c.text}>Q</text>
      {/* Center label */}
      <text x="44" y="32" textAnchor="middle" fontSize="9" fontWeight="600"
            fontFamily="monospace" fill={c.stroke} opacity="0.7">LATCH</text>
      {/* Divider line */}
      <line x1="28" y1="8" x2="28" y2="48" stroke={c.stroke} strokeWidth="0.5" opacity="0.3" />
      {/* Input/output stubs */}
      <line x1="0" y1="18" x2="4" y2="18" stroke={c.stroke} strokeWidth="1.5" />
      <line x1="0" y1="40" x2="4" y2="40" stroke={c.stroke} strokeWidth="1.5" />
      <line x1="80" y1="28" x2="90" y2="28" stroke={c.stroke} strokeWidth="1.5" />
    </svg>
  );
}

// ─── Rising Edge Trigger (IEEE: rectangle with rising-edge symbol) ───────────
// Node: 80x42
function RisingEdgeShape({ c, label }: { c: ReturnType<typeof getColors>; label: string }) {
  return (
    <svg width="80" height="42" viewBox="0 0 80 42" style={{ display: 'block' }}>
      <rect x="4" y="4" width="66" height="34" rx="3"
        fill={c.fill} stroke={c.stroke} strokeWidth="2"
      />
      {/* Rising edge symbol: step waveform going up */}
      <polyline points="14,28 14,14 26,14" fill="none"
        stroke={c.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      />
      {/* Arrow pointing up on the rising edge */}
      <polyline points="12,18 14,13 16,18" fill="none"
        stroke={c.text} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      />
      {/* Label */}
      <text x="48" y="25" textAnchor="middle" fontSize="9" fontWeight="bold"
            fontFamily="monospace" fill={c.text}>R_TRIG</text>
      {/* Stubs */}
      <line x1="0" y1="21" x2="4" y2="21" stroke={c.stroke} strokeWidth="1.5" />
      <line x1="70" y1="21" x2="80" y2="21" stroke={c.stroke} strokeWidth="1.5" />
    </svg>
  );
}

// ─── Falling Edge Trigger (IEEE: rectangle with falling-edge symbol) ─────────
// Node: 80x42
function FallingEdgeShape({ c, label }: { c: ReturnType<typeof getColors>; label: string }) {
  return (
    <svg width="80" height="42" viewBox="0 0 80 42" style={{ display: 'block' }}>
      <rect x="4" y="4" width="66" height="34" rx="3"
        fill={c.fill} stroke={c.stroke} strokeWidth="2"
      />
      {/* Falling edge symbol: step waveform going down */}
      <polyline points="14,14 14,28 26,28" fill="none"
        stroke={c.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      />
      {/* Arrow pointing down */}
      <polyline points="12,24 14,29 16,24" fill="none"
        stroke={c.text} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      />
      {/* Label */}
      <text x="48" y="25" textAnchor="middle" fontSize="9" fontWeight="bold"
            fontFamily="monospace" fill={c.text}>F_TRIG</text>
      {/* Stubs */}
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
      {/* Pulse waveform */}
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

// ─── Main exported node ───────────────────────────────────────────────────────

export const SelNode = memo(({ data }: { data: SelNodeData }) => {
  const c = getColors(data.kind, data.active, data.selected, data.highlighted);
  const glow = data.active
    ? '0 0 10px rgba(74,222,128,0.6)'
    : data.selected
    ? '0 0 8px rgba(250,204,21,0.5)'
    : data.highlighted
    ? '0 0 6px rgba(96,165,250,0.4)'
    : 'none';

  const handleStyle = { background: c.stroke, width: 8, height: 8, border: `2px solid ${c.stroke}` };

  // AND gate
  if (data.kind === 'and') {
    return (
      <div style={{ position: 'relative', boxShadow: glow, borderRadius: 4 }}>
        <Handle type="target" position={Position.Left}  style={{ ...handleStyle, top: '50%' }} />
        <AndGateShape c={c} />
        <Handle type="source" position={Position.Right} style={{ ...handleStyle, top: '50%' }} />
      </div>
    );
  }

  // OR gate
  if (data.kind === 'or') {
    return (
      <div style={{ position: 'relative', boxShadow: glow, borderRadius: 4 }}>
        <Handle type="target" position={Position.Left}  style={{ ...handleStyle, top: '50%' }} />
        <OrGateShape c={c} />
        <Handle type="source" position={Position.Right} style={{ ...handleStyle, top: '50%' }} />
      </div>
    );
  }

  // NOT / inverter
  if (data.kind === 'not') {
    return (
      <div style={{ position: 'relative', boxShadow: glow, borderRadius: 4 }}>
        <Handle type="target" position={Position.Left}  style={{ ...handleStyle, top: '50%' }} />
        <NotGateShape c={c} />
        <Handle type="source" position={Position.Right} style={{ ...handleStyle, top: '50%' }} />
      </div>
    );
  }

  // Timer (PCT, TON, TOF)
  if (data.kind === 'timer') {
    return (
      <div style={{ position: 'relative', boxShadow: glow, borderRadius: 4 }}>
        <Handle type="target" position={Position.Left}  style={{ ...handleStyle, top: '50%' }} />
        <TimerShape c={c} label={data.label} />
        <Handle type="source" position={Position.Right} style={{ ...handleStyle, top: '50%' }} />
      </div>
    );
  }

  // Latch (SET/RST SR flip-flop)
  if (data.kind === 'latch') {
    return (
      <div style={{ position: 'relative', boxShadow: glow, borderRadius: 4 }}>
        <Handle type="target" position={Position.Left}  style={{ ...handleStyle, top: '32%' }} />
        <LatchShape c={c} label={data.label} />
        <Handle type="source" position={Position.Right} style={{ ...handleStyle, top: '50%' }} />
      </div>
    );
  }

  // Rising edge trigger
  if (data.kind === 'rising') {
    return (
      <div style={{ position: 'relative', boxShadow: glow, borderRadius: 4 }}>
        <Handle type="target" position={Position.Left}  style={{ ...handleStyle, top: '50%' }} />
        <RisingEdgeShape c={c} label={data.label} />
        <Handle type="source" position={Position.Right} style={{ ...handleStyle, top: '50%' }} />
      </div>
    );
  }

  // Falling edge trigger
  if (data.kind === 'falling') {
    return (
      <div style={{ position: 'relative', boxShadow: glow, borderRadius: 4 }}>
        <Handle type="target" position={Position.Left}  style={{ ...handleStyle, top: '50%' }} />
        <FallingEdgeShape c={c} label={data.label} />
        <Handle type="source" position={Position.Right} style={{ ...handleStyle, top: '50%' }} />
      </div>
    );
  }

  // Pulse (one-shot)
  if (data.kind === 'pulse') {
    return (
      <div style={{ position: 'relative', boxShadow: glow, borderRadius: 4 }}>
        <Handle type="target" position={Position.Left}  style={{ ...handleStyle, top: '50%' }} />
        <PulseShape c={c} />
        <Handle type="source" position={Position.Right} style={{ ...handleStyle, top: '50%' }} />
      </div>
    );
  }

  // All other node types: named rectangular node
  return (
    <div style={{ position: 'relative', boxShadow: glow, borderRadius: 5 }}>
      <Handle type="target" position={Position.Left}  style={{ ...handleStyle, top: '50%' }} />
      <NamedNodeShape label={data.label} kind={data.kind} c={c} sourceValue={data.sourceValue} />
      <Handle type="source" position={Position.Right} style={{ ...handleStyle, top: '50%' }} />
    </div>
  );
});

SelNode.displayName = 'SelNode';
