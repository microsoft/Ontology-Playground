import type {
  RdfNamedNode,
  RdfPatch,
  RdfProjectionLiteral,
  RdfProjectionMap,
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
  projection = document.projection,
): ReadyRdfDocument {
  return {
    ...document,
    revision: document.revision + 1,
    projection,
    patches: [...document.patches, patch],
  };
}

function mappedLiteralQuad(
  target: RdfProjectionResource,
  predicateIri: string,
  mapping: RdfProjectionLiteral,
): RdfQuad {
  return {
    subject: { ...target.term },
    predicate: { termType: 'NamedNode', value: predicateIri },
    object: {
      ...mapping.object,
      datatype: { ...mapping.object.datatype },
    },
    graph: { ...mapping.graph },
  };
}

function updateLiteralProjection(
  projection: RdfProjectionMap,
  removal: RdfQuad,
  addition: RdfQuad,
): RdfProjectionMap {
  if (addition.object.termType !== 'Literal') return projection;
  const literalAddition = addition.object;
  const predicate = addition.predicate.value;
  const updateResource = (
    resource: RdfProjectionResource,
  ): RdfProjectionResource => {
    const mapping = resource.literals?.[predicate];
    if (
      !mapping
      || rdfQuadKey(mappedLiteralQuad(resource, predicate, mapping))
        !== rdfQuadKey(removal)
    ) {
      return resource;
    }
    return {
      ...resource,
      literals: {
        ...resource.literals,
        [predicate]: {
          object: {
            ...literalAddition,
            datatype: { ...literalAddition.datatype },
          },
          graph: { ...addition.graph },
        },
      },
    };
  };
  return {
    ...(projection.ontology
      ? { ontology: updateResource(projection.ontology) }
      : {}),
    entities: Object.fromEntries(
      Object.entries(projection.entities).map(([id, resource]) => [
        id,
        updateResource(resource),
      ]),
    ),
    relationships: Object.fromEntries(
      Object.entries(projection.relationships).map(
        ([id, relationship]) => {
          if (!relationship.term) return [id, relationship];
          const updated = updateResource({
            term: relationship.term,
            literals: relationship.literals,
          });
          return [
            id,
            {
              ...relationship,
              ...(updated.literals
                ? { literals: updated.literals }
                : {}),
            },
          ];
        },
      ),
    ),
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
  const mapping = target.literals?.[predicateIri];
  if (!mapping) {
    const lexicalMatches = current.filter((quad) =>
      quad.subject.termType === 'NamedNode'
      && quad.subject.value === target.term.value
      && quad.predicate.value === predicateIri
      && quad.object.termType === 'Literal'
      && quad.object.value === oldValue
    );
    if (lexicalMatches.length > 1) {
      throw new Error(
        'This visual value maps to multiple RDF literals and is ambiguous.',
      );
    }
    throw new Error(
      'This visual value is not backed by one editable RDF literal.',
    );
  }
  if (mapping.object.value !== oldValue) {
    throw new Error(
      'This visual value is not backed by one editable RDF literal.',
    );
  }
  const currentByKey = new Map(
    current.map((quad) => [rdfQuadKey(quad), quad]),
  );
  const expected = mappedLiteralQuad(target, predicateIri, mapping);
  const matched = currentByKey.get(rdfQuadKey(expected));
  if (!matched) {
    throw new Error(
      'The exactly mapped RDF literal is no longer present.',
    );
  }
  const removal = cloneRdfQuad(matched);
  const addition = cloneRdfQuad(removal);
  if (addition.object.termType !== 'Literal') {
    throw new Error('The mapped RDF statement is not a literal.');
  }
  addition.object.value = newValue;

  return appendPatch(
    document,
    {
      id: patchId(document),
      description,
      removals: [removal],
      additions: [addition],
    },
    updateLiteralProjection(document.projection, removal, addition),
  );
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
