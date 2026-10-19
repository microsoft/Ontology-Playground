import type {
  RdfNamedNode,
  RdfPatch,
  RdfProjectionResource,
  RdfQuad,
  ReadyRdfDocument,
} from '../../types/rdfDocument';
import {
  assertXml10Compatible,
  cloneRdfQuad,
  materializeRdfPatches,
  rdfQuadKey,
} from './dataset';

const RDFS_SUBCLASS_OF =
  'http://www.w3.org/2000/01/rdf-schema#subClassOf';

function appendPatch(
  document: ReadyRdfDocument,
  patch: RdfPatch,
): ReadyRdfDocument {
  return {
    ...document,
    revision: document.revision + 1,
    patches: [...document.patches, patch],
  };
}

function patchId(document: ReadyRdfDocument): string {
  return `${document.id}:patch:${document.revision + 1}`;
}

export function applyLiteralEdit(
  document: ReadyRdfDocument,
  target: RdfProjectionResource,
  predicateIri: string,
  oldValue: string,
  newValue: string,
  description: string,
): ReadyRdfDocument {
  if (oldValue === newValue) return document;
  assertXml10Compatible(newValue, 'Edited RDF literal');
  const current = materializeRdfPatches(
    document.originalQuads,
    document.patches,
  );
  const matches = current.filter((quad) =>
    quad.subject.termType === 'NamedNode'
    && quad.subject.value === target.term.value
    && quad.predicate.value === predicateIri
    && quad.object.termType === 'Literal'
    && quad.object.value === oldValue);

  if (matches.length === 0) {
    throw new Error(
      'This visual value is not backed by one editable RDF literal.',
    );
  }
  if (matches.length > 1) {
    throw new Error(
      'This visual value maps to multiple RDF literals and is ambiguous.',
    );
  }

  const removal = cloneRdfQuad(matches[0]);
  const addition = cloneRdfQuad(removal);
  if (addition.object.termType !== 'Literal') {
    throw new Error('The mapped RDF statement is not a literal.');
  }
  addition.object.value = newValue;

  return appendPatch(document, {
    id: patchId(document),
    description,
    removals: [removal],
    additions: [addition],
  });
}

function subclassQuad(
  child: RdfNamedNode,
  parent: RdfNamedNode,
): RdfQuad {
  return {
    subject: { ...child },
    predicate: {
      termType: 'NamedNode',
      value: RDFS_SUBCLASS_OF,
    },
    object: { ...parent },
    graph: { termType: 'DefaultGraph', value: '' },
  };
}

export function applySubclassEdit(
  document: ReadyRdfDocument,
  oldChild: RdfNamedNode,
  oldParent: RdfNamedNode,
  newChild: RdfNamedNode,
  newParent: RdfNamedNode,
  description: string,
): ReadyRdfDocument {
  const current = new Map(
    materializeRdfPatches(
      document.originalQuads,
      document.patches,
    ).map((quad) => [rdfQuadKey(quad), quad]),
  );
  const oldQuad = subclassQuad(oldChild, oldParent);
  const existing = current.get(rdfQuadKey(oldQuad));
  if (!existing) {
    throw new Error(
      'The subclass edge is no longer backed by the expected RDF statement.',
    );
  }
  const newQuad = subclassQuad(newChild, newParent);
  if (rdfQuadKey(oldQuad) === rdfQuadKey(newQuad)) return document;
  if (current.has(rdfQuadKey(newQuad))) {
    throw new Error(
      'That direct subclass statement already exists.',
    );
  }

  return appendPatch(document, {
    id: patchId(document),
    description,
    removals: [cloneRdfQuad(existing)],
    additions: [newQuad],
  });
}

export function applySubclassRemoval(
  document: ReadyRdfDocument,
  child: RdfNamedNode,
  parent: RdfNamedNode,
  description: string,
): ReadyRdfDocument {
  const current = new Map(
    materializeRdfPatches(
      document.originalQuads,
      document.patches,
    ).map((quad) => [rdfQuadKey(quad), quad]),
  );
  const expected = subclassQuad(child, parent);
  const existing = current.get(rdfQuadKey(expected));
  if (!existing) {
    throw new Error(
      'The subclass edge is no longer backed by the expected RDF statement.',
    );
  }
  return appendPatch(document, {
    id: patchId(document),
    description,
    removals: [cloneRdfQuad(existing)],
    additions: [],
  });
}
