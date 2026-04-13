import React, { useEffect, useRef } from 'react';
import styles from './GraphView.module.css';

interface ContextMenuProps {
  x: number;
  y: number;
  nodeId: string;
  nodeLabel: string;
  onRemoveFromView: () => void;
  onElementBreakdown: () => void;
  onClose: () => void;
}

export function ContextMenu({
  x, y, nodeLabel,
  onRemoveFromView, onElementBreakdown, onClose,
}: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('touchstart', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('touchstart', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // Clamp position to viewport so menu doesn't go off-screen (important on mobile)
  const menuWidth = 180;
  const menuHeight = 120;
  const safeX = Math.min(x, window.innerWidth - menuWidth - 8);
  const safeY = Math.min(y, window.innerHeight - menuHeight - 8);

  return (
    <div
      ref={ref}
      className={styles.contextMenu}
      style={{ left: Math.max(8, safeX), top: Math.max(8, safeY) }}
    >
      <div className={styles.contextMenuTitle}>{nodeLabel}</div>
      <button className={styles.contextMenuItem} onClick={onElementBreakdown}>
        Element Breakdown
      </button>
      <button className={styles.contextMenuItemDanger} onClick={onRemoveFromView}>
        Remove from View
      </button>
    </div>
  );
}
