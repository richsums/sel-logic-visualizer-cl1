// ─── Long-press detection for mobile touch devices ──────────────────────────
// Returns touch event handlers to attach to a container element.
// On long-press (default 500ms), calls `onLongPress` with the touch position
// and the DOM element that was pressed. Short taps are ignored (handled by
// React Flow's onNodeClick instead).

import { useRef, useCallback } from 'react';

interface LongPressOptions {
  /** Duration in ms before press qualifies as "long" (default 500) */
  delay?: number;
  /** Called when long-press is detected */
  onLongPress: (x: number, y: number, target: HTMLElement) => void;
}

export function useLongPress({ delay = 500, onLongPress }: LongPressOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPressRef = useRef(false);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    didLongPressRef.current = false;
    const touch = e.touches[0];
    startPosRef.current = { x: touch.clientX, y: touch.clientY };

    timerRef.current = setTimeout(() => {
      didLongPressRef.current = true;
      timerRef.current = null;

      // Prevent the subsequent click/tap from firing
      onLongPress(touch.clientX, touch.clientY, e.target as HTMLElement);
    }, delay);
  }, [delay, onLongPress]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    // Cancel long-press if finger moved more than 10px (it's a drag/pan)
    if (startPosRef.current) {
      const touch = e.touches[0];
      const dx = touch.clientX - startPosRef.current.x;
      const dy = touch.clientY - startPosRef.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > 10) {
        clear();
      }
    }
  }, [clear]);

  const onTouchEnd = useCallback(() => {
    clear();
  }, [clear]);

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    /** True if the most recent touch sequence was a long-press (use to suppress tap) */
    didLongPress: didLongPressRef,
  };
}
