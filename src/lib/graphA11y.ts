import type { Ontology } from '../data/ontology';

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * Accessible name for the graph canvas.
 *
 * Cytoscape paints the ontology into `<canvas>` elements, which expose nothing
 * to assistive technology — without this the graph is an unlabelled region and
 * a screen reader announces nothing at all for the app's central feature. The
 * container carries `role="img"` and this summary as its label; the entity and
 * relationship names themselves stay reachable in the search panel and legend
 * rather than being duplicated into one long label.
 */
export function describeOntologyGraph(ontology: Ontology): string {
  const name = ontology.name?.trim();
  const subject = name ? `${name} ontology graph` : 'Ontology graph';
  const entityTypes = pluralize(ontology.entityTypes.length, 'entity type');
  const relationships = pluralize(ontology.relationships.length, 'relationship');
  return `${subject}: ${entityTypes}, ${relationships}. Interactive diagram.`;
}
