import { describe, expect, it, vi } from 'vitest';

vi.mock('cytoscape', () => {
  const cytoscape = vi.fn();
  Object.assign(cytoscape, { use: vi.fn() });
  return { default: cytoscape };
});
vi.mock('cytoscape-fcose', () => ({ default: vi.fn() }));

import { parseOrganizationGraph } from './OrganizationDashboard';

describe('parseOrganizationGraph', () => {
  it('preserves all search aliases for an organization', () => {
    const graph = parseOrganizationGraph(`<?xml version="1.0"?>
      <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
        xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
        xmlns:evo="https://example.org/ontology/ntt-data-evolution/">
        <evo:OrganizationalUnit rdf:about="https://example.org/ais">
          <rdfs:label>AIストラテジー推進部</rdfs:label>
          <evo:searchTerm>AIストラテジー推進部</evo:searchTerm>
          <evo:searchTerm>AIS</evo:searchTerm>
        </evo:OrganizationalUnit>
      </rdf:RDF>`);

    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0].searchTerms).toBe('AIストラテジー推進部 / AIS');
  });
});
