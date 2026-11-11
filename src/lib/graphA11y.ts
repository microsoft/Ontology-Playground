import type { Ontology } from '../data/ontology';
import type { GraphView } from './graphView';

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * Accessible name for the graph canvas.
 *
 * Cytoscape paints the ontology into `<canvas>` elements, which expose nothing
 * to assistive technology — without this the graph is an unlabelled region and
 * a screen reader announces nothing at all for the app's central feature. The
 * container carries `role="img"` and this summary as its label. Controls and
 * the legend remain siblings so they are not hidden by the image role.
 */
export function describeOntologyGraph(
  ontology: Ontology,
  view?: Pick<GraphView, 'mode' | 'visibleNodeCount' | 'visibleEdgeCount'>,
): string {
  const name = ontology.name?.trim();
  const subject = name ? `${name} ontology graph` : 'Ontology graph';
  const entityTypes = pluralize(ontology.entityTypes.length, 'entity type');
  const relationships = pluralize(ontology.relationships.length, 'relationship');
  const overview = view?.mode === 'bounded'
    ? ` Semantic overview showing ${pluralize(view.visibleNodeCount, 'entity type')} and ${pluralize(view.visibleEdgeCount, 'relationship')}.`
    : '';
  return `${subject}: ${entityTypes}, ${relationships}.${overview} Interactive diagram.`;
}
