import { useEffect, useState } from 'react';
import type { Core } from 'cytoscape';

export interface GraphNodeActionPosition {
  left: number;
  top: number;
  placement: 'above' | 'below';
}

export function useGraphNodeActionPosition(
  cy: Core | null,
  nodeId: string | null,
  enabled: boolean,
): GraphNodeActionPosition | null {
  const [position, setPosition] = useState<GraphNodeActionPosition | null>(null);

  useEffect(() => {
    if (!cy || cy.destroyed() || !nodeId || !enabled) {
      setPosition(null);
      return;
    }

    const updatePosition = () => {
      if (cy.destroyed()) {
        setPosition(null);
        return;
      }
      const node = cy.getElementById(nodeId);
      if (node.length === 0) {
        setPosition(null);
        return;
      }

      const bounds = node.renderedBoundingBox({
        includeLabels: false,
        includeOverlays: false,
      });
      const graphWidth = cy.width();
      const graphHeight = cy.height();
      const horizontalInset = Math.min(110, graphWidth / 2);
      const placement = (
        bounds.y1 >= 64
        || bounds.y2 + 64 > graphHeight
      ) ? 'above' : 'below';

      setPosition({
        left: Math.min(
          graphWidth - horizontalInset,
          Math.max(horizontalInset, (bounds.x1 + bounds.x2) / 2),
        ),
        top: placement === 'above'
          ? Math.max(8, bounds.y1 - 10)
          : Math.min(graphHeight - 8, bounds.y2 + 10),
        placement,
      });
    };

    let animationFrame = 0;
    const scheduleUpdate = () => {
      if (animationFrame !== 0) return;
      animationFrame = requestAnimationFrame(() => {
        animationFrame = 0;
        updatePosition();
      });
    };

    updatePosition();
    cy.on('pan zoom resize layoutstop', scheduleUpdate);
    cy.on('position', 'node', scheduleUpdate);
    window.addEventListener('resize', scheduleUpdate);

    return () => {
      if (animationFrame !== 0) cancelAnimationFrame(animationFrame);
      cy.off('pan zoom resize layoutstop', scheduleUpdate);
      cy.off('position', 'node', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
    };
  }, [cy, enabled, nodeId]);

  return position;
}
