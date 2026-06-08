import React, { memo } from 'react';
import { useAppStore } from '../../store/appStore';
import type { OutputClass } from '../../core/ir/types';

interface AreaFrameData {
  label: string;
  outputClass: OutputClass;
  width: number;
  height: number;
  variant: 'normal' | 'unused';
}

// Border/header accent per logic purpose so areas are visually distinct.
const ACCENT: Record<OutputClass, string> = {
  trip: '#c0426a',
  close: '#3d8a5e',
  breaker_failure: '#b07030',
  reclose: '#8050b8',
  alarm: '#c0a030',
  block: '#a04040',
  supervisory: '#4870b0',
  display: '#6b7280',
  led: '#6b7280',
  other: '#5a6b85',
};

export const AreaFrame = memo(({ data }: { data: AreaFrameData }) => {
  const colorMode = useAppStore((s) => s.colorMode);
  const dark = colorMode === 'dark';
  const isUnused = data.variant === 'unused';

  const accent = isUnused ? '#6b7280' : (ACCENT[data.outputClass] ?? ACCENT.other);
  const headerBg = isUnused
    ? (dark ? '#2a2f3a' : '#e5e7eb')
    : accent;
  const headerText = isUnused
    ? (dark ? '#9ca3af' : '#4b5563')
    : '#ffffff';

  return (
    <div
      style={{
        width: data.width,
        height: data.height,
        border: `2px solid ${accent}`,
        borderRadius: 8,
        background: isUnused
          ? (dark ? 'rgba(75,85,99,0.10)' : 'rgba(229,231,235,0.45)')
          : (dark ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0.012)'),
        boxSizing: 'border-box',
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: 26,
          lineHeight: '26px',
          padding: '0 12px',
          background: headerBg,
          color: headerText,
          fontSize: 12,
          fontWeight: 700,
          fontFamily: 'monospace',
          letterSpacing: 0.3,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          opacity: isUnused ? 0.85 : 1,
        }}
      >
        {data.label}
      </div>
    </div>
  );
});

AreaFrame.displayName = 'AreaFrame';
