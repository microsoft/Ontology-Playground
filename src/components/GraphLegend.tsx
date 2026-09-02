import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { EntityType } from '../data/ontology';

const STORAGE_KEY = 'ontology-legend-collapsed';

/**
 * Above this many entity types an expanded legend blankets the canvas, so it
 * opens collapsed instead. Imported taxonomies routinely exceed this — Brick
 * 1.4 alone carries over 1,500 classes.
 */
export const LEGEND_AUTO_COLLAPSE_THRESHOLD = 12;

/** Returns the stored preference, or null when the user has never toggled it. */
function readStoredCollapsed(): boolean | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
  } catch { /* localStorage unavailable */ }
  return null;
}

function defaultCollapsed(entityTypeCount: number): boolean {
  const stored = readStoredCollapsed();
  if (stored !== null) return stored;
  return entityTypeCount > LEGEND_AUTO_COLLAPSE_THRESHOLD;
}

interface GraphLegendProps {
  entityTypes: EntityType[];
}

/**
 * Entity-type key overlaid on the graph canvas. Collapsible so it can be moved
 * out of the way of the nodes it sits on top of, remembering the choice across
 * sessions.
 */
export function GraphLegend({ entityTypes }: GraphLegendProps) {
  const entityTypeCount = entityTypes.length;
  const [collapsed, setCollapsed] = useState(() => defaultCollapsed(entityTypeCount));

  // Loading a much larger ontology re-applies the size heuristic, so importing
  // a big taxonomy into an open session doesn't bury the graph. An explicit
  // user choice still wins.
  useEffect(() => {
    if (readStoredCollapsed() !== null) return;
    setCollapsed(entityTypeCount > LEGEND_AUTO_COLLAPSE_THRESHOLD);
  }, [entityTypeCount]);

  const toggle = () => {
    setCollapsed(previous => {
      const next = !previous;
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* noop */ }
      return next;
    });
  };

  return (
    <div className={`graph-legend ${collapsed ? 'graph-legend--collapsed' : ''}`}>
      <button
        type="button"
        className="legend-toggle"
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-controls="graph-legend-body"
        // Keeps the visible "Entity Types" label inside the accessible name
        // (WCAG 2.5.3) while still saying what the button does.
        aria-label={collapsed ? 'Show Entity Types legend' : 'Hide Entity Types legend'}
        title={collapsed ? 'Show Entity Types legend' : 'Hide Entity Types legend'}
      >
        <span className="legend-title">Entity Types</span>
        <span className="legend-count">{entityTypeCount}</span>
        {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {!collapsed && (
        <div id="graph-legend-body" className="legend-body">
          {entityTypes.map(entity => (
            <div key={entity.id} className="legend-item">
              <div className="legend-dot" style={{ backgroundColor: entity.color }} />
              <span>{entity.icon} {entity.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
