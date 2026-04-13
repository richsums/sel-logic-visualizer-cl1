// Custom edge that draws a negation bubble (small circle) at the target end
import React from 'react';
import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react';

const BUBBLE_RADIUS = 5;

export function NegatedEdge(props: EdgeProps) {
  const {
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
    style, markerEnd, animated,
  } = props;

  // Shorten the path to leave room for the bubble
  const adjustedTargetX = targetX - BUBBLE_RADIUS * 2 - 2;

  const [edgePath] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition,
    targetX: adjustedTargetX, targetY, targetPosition,
    borderRadius: 8,
  });

  const strokeColor = style?.stroke ?? '#c05050';

  return (
    <>
      <BaseEdge
        path={edgePath}
        style={style}
        markerEnd={markerEnd}
      />
      {/* Negation bubble at target */}
      <circle
        cx={targetX - BUBBLE_RADIUS - 1}
        cy={targetY}
        r={BUBBLE_RADIUS}
        fill="none"
        stroke={strokeColor as string}
        strokeWidth={1.5}
        className={animated ? 'react-flow__edge-interaction' : undefined}
      />
    </>
  );
}
