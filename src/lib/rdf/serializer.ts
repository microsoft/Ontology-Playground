import type {
  DataBinding,
  Ontology,
  Relationship,
} from '../../data/ontology';

export type RdfExportProfile = 'playground' | 'standards';

export interface RdfSerializationOptions {
  profile?: RdfExportProfile;
}

export const PLAYGROUND_METADATA_NS =
  'https://microsoft.github.io/Ontology-Playground/ns/metadata#';

const RDF_NS = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const XSD_NS = 'http://www.w3.org/2001/XMLSchema#';

const XSD_TYPE_MAP: Record<string, string> = {
  string: 'string',
  integer: 'integer',
  decimal: 'decimal',
  double: 'double',
  date: 'date',
  datetime: 'dateTime',
  boolean: 'boolean',
  enum: 'string',
};

const PLAYGROUND_ANNOTATIONS = {
  icon: 'Presentation icon for an entity type.',
  color: 'Presentation color for an entity type.',
  isIdentifier: 'Whether an entity property is used as its Playground identifier.',
  unit: 'Display unit associated with a numeric property.',
  enumValues: 'Comma-delimited enum values used only by Playground round trips.',
  propertyType: 'Playground property type: string, integer, decimal, double, date, datetime, boolean, or enum.',
  cardinality: 'Playground relationship multiplicity: one-to-one, one-to-many, many-to-one, or many-to-many.',
  fromEntityId: 'Playground ID of a relationship source entity.',
  toEntityId: 'Playground ID of a relationship target entity.',
  relationshipAttributeOf: 'Playground ID of the relationship described by an attribute.',
  attributeType: 'Playground relationship attribute type: string, integer, decimal, double, date, datetime, boolean, or enum.',
  generatedSubset: 'Whether this RDF document was generated from the Playground visual model.',
  sourceVersionIri: 'Version IRI of the source ontology represented by the visual model.',
  sourceVersionInfo: 'Version label of the source ontology represented by the visual model.',
  sourceImport: 'Import IRI recorded from the source ontology without dereferencing it.',
  boundClass: 'Domain class targeted by a Playground data binding.',
  boundEntityId: 'Playground entity ID targeted by a data binding.',
  source: 'Source name retained by a Playground data binding.',
  table: 'Table name retained by a Playground data binding.',
  columnMapping: 'Property-to-column mapping retained by a Playground data binding.',
} as const;

export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function deriveBaseUri(ontologyName: string): string {
  const slug = ontologyName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `http://example.org/ontology/${slug || 'unnamed'}/`;
}

function serializeNamespaces(
  baseUri: string,
  includeShacl: boolean,
  includePlaygroundMetadata: boolean,
): string {
  let rdf = '<rdf:RDF\n';
  rdf += `    xml:base="${escapeXml(baseUri)}"\n`;
  rdf += `    xmlns:rdf="${RDF_NS}"\n`;
  rdf += '    xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"\n';
  rdf += '    xmlns:owl="http://www.w3.org/2002/07/owl#"\n';
  rdf += `    xmlns:xsd="${XSD_NS}"\n`;
  rdf += '    xmlns:dcterms="http://purl.org/dc/terms/"\n';
  rdf += `    xmlns:ont="${escapeXml(baseUri)}"\n`;
  if (includeShacl) {
    rdf += '    xmlns:sh="http://www.w3.org/ns/shacl#"\n';
  }
  if (includePlaygroundMetadata) {
    rdf += `    xmlns:opmeta="${PLAYGROUND_METADATA_NS}"\n`;
  }
  rdf += '>\n\n';
  return rdf;
}

function serializeOntologyDeclaration(
  ontology: Ontology,
  baseUri: string,
): string {
  const metadata = ontology.rdfMetadata;
  let rdf = `    <owl:Ontology rdf:about="${escapeXml(baseUri)}">\n`;
  rdf += `        <rdfs:label>${escapeXml(ontology.name)}</rdfs:label>\n`;
  if (ontology.description) {
    rdf += `        <rdfs:comment>${escapeXml(ontology.description)}</rdfs:comment>\n`;
  }
  if (metadata) {
    rdf += `        <opmeta:generatedSubset rdf:datatype="${XSD_NS}boolean">true</opmeta:generatedSubset>\n`;
  }
  if (metadata?.ontologyIri) {
    rdf += `        <dcterms:source rdf:resource="${escapeXml(metadata.ontologyIri)}"/>\n`;
  }
  if (metadata?.versionIri) {
    rdf += `        <opmeta:sourceVersionIri rdf:resource="${escapeXml(metadata.versionIri)}"/>\n`;
  }
  if (metadata?.versionInfo) {
    rdf += `        <opmeta:sourceVersionInfo>${escapeXml(metadata.versionInfo)}</opmeta:sourceVersionInfo>\n`;
  }
  if (metadata?.license) {
    const license = escapeXml(metadata.license);
    if (/^[a-z][a-z0-9+.-]*:/i.test(metadata.license)) {
      rdf += `        <dcterms:license rdf:resource="${license}"/>\n`;
    } else {
      rdf += `        <dcterms:license>${license}</dcterms:license>\n`;
    }
  }
  for (const importedIri of metadata?.imports ?? []) {
    rdf += `        <opmeta:sourceImport rdf:resource="${escapeXml(importedIri)}"/>\n`;
  }
  rdf += '    </owl:Ontology>\n\n';
  return rdf;
}

function subclassParents(ontology: Ontology): Map<string, string[]> {
  const parentsByEntity = new Map<string, string[]>();
  for (const relationship of ontology.relationships) {
    if (relationship.kind !== 'subclass') continue;
    const parents = parentsByEntity.get(relationship.from);
    if (parents) parents.push(relationship.to);
    else parentsByEntity.set(relationship.from, [relationship.to]);
  }
  return parentsByEntity;
}

function propertyIri(baseUri: string, entityId: string, propertyName: string): string {
  return `${baseUri}${entityId}_${propertyName}`;
}

function serializePlaygroundMetadataDeclarations(): string {
  let rdf = '    <!-- Ontology Playground metadata vocabulary -->\n';
  rdf += `    <rdfs:Class rdf:about="${PLAYGROUND_METADATA_NS}DataBinding">\n`;
  rdf += '        <rdfs:label>Ontology Playground data binding</rdfs:label>\n';
  rdf += '    </rdfs:Class>\n';
  for (const [annotation, description] of Object.entries(PLAYGROUND_ANNOTATIONS)) {
    rdf += `    <owl:AnnotationProperty rdf:about="${PLAYGROUND_METADATA_NS}${annotation}">\n`;
    rdf += `        <rdfs:label>${annotation}</rdfs:label>\n`;
    rdf += `        <rdfs:comment>${escapeXml(description)}</rdfs:comment>\n`;
    rdf += '    </owl:AnnotationProperty>\n';
  }
  return `${rdf}\n`;
}

export function serializePlaygroundRDF(
  ontology: Ontology,
  bindings: DataBinding[] = [],
): string {
  const baseUri = deriveBaseUri(ontology.name);
  const parentsByEntity = subclassParents(ontology);
  let rdf = '<?xml version="1.0" encoding="UTF-8"?>\n';
  rdf += serializeNamespaces(baseUri, false, true);
  rdf += serializeOntologyDeclaration(ontology, baseUri);
  rdf += serializePlaygroundMetadataDeclarations();

  rdf += '    <!-- Entity Types (Classes) -->\n';
  for (const entity of ontology.entityTypes) {
    const className = capitalize(entity.id);
    rdf += `    <owl:Class rdf:about="${escapeXml(baseUri + className)}">\n`;
    rdf += `        <rdfs:label>${escapeXml(entity.name)}</rdfs:label>\n`;
    if (entity.description) {
      rdf += `        <rdfs:comment>${escapeXml(entity.description)}</rdfs:comment>\n`;
    }
    for (const parentId of parentsByEntity.get(entity.id) ?? []) {
      rdf += `        <rdfs:subClassOf rdf:resource="${escapeXml(baseUri + capitalize(parentId))}"/>\n`;
    }
    rdf += `        <opmeta:icon>${escapeXml(entity.icon)}</opmeta:icon>\n`;
    rdf += `        <opmeta:color>${escapeXml(entity.color)}</opmeta:color>\n`;
    rdf += '    </owl:Class>\n\n';
  }

  rdf += '    <!-- Data Properties -->\n';
  for (const entity of ontology.entityTypes) {
    const className = capitalize(entity.id);
    for (const property of entity.properties) {
      const iri = propertyIri(baseUri, entity.id, property.name);
      const xsdType = XSD_TYPE_MAP[property.type] || 'string';
      rdf += `    <owl:DatatypeProperty rdf:about="${escapeXml(iri)}">\n`;
      rdf += `        <rdfs:label>${escapeXml(property.name)}</rdfs:label>\n`;
      rdf += `        <rdfs:domain rdf:resource="${escapeXml(baseUri + className)}"/>\n`;
      rdf += `        <rdfs:range rdf:resource="${XSD_NS}${xsdType}"/>\n`;
      if (property.description) {
        rdf += `        <rdfs:comment>${escapeXml(property.description)}</rdfs:comment>\n`;
      }
      if (property.isIdentifier) {
        rdf += `        <opmeta:isIdentifier rdf:datatype="${XSD_NS}boolean">true</opmeta:isIdentifier>\n`;
      }
      if (property.unit) {
        rdf += `        <opmeta:unit>${escapeXml(property.unit)}</opmeta:unit>\n`;
      }
      if (property.values && property.values.length > 0) {
        rdf += `        <opmeta:enumValues>${escapeXml(property.values.join(','))}</opmeta:enumValues>\n`;
      }
      rdf += `        <opmeta:propertyType>${escapeXml(property.type)}</opmeta:propertyType>\n`;
      rdf += '    </owl:DatatypeProperty>\n\n';
    }
  }

  rdf += '    <!-- Object Properties -->\n';
  for (const relationship of ontology.relationships) {
    if (relationship.kind === 'subclass') continue;
    const fromClass = capitalize(relationship.from);
    const toClass = capitalize(relationship.to);
    rdf += `    <owl:ObjectProperty rdf:about="${escapeXml(baseUri + relationship.id)}">\n`;
    rdf += `        <rdfs:label>${escapeXml(relationship.name)}</rdfs:label>\n`;
    rdf += `        <rdfs:domain rdf:resource="${escapeXml(baseUri + fromClass)}"/>\n`;
    rdf += `        <rdfs:range rdf:resource="${escapeXml(baseUri + toClass)}"/>\n`;
    if (relationship.description) {
      rdf += `        <rdfs:comment>${escapeXml(relationship.description)}</rdfs:comment>\n`;
    }
    rdf += `        <opmeta:cardinality>${relationship.cardinality}</opmeta:cardinality>\n`;
    rdf += `        <opmeta:fromEntityId>${escapeXml(relationship.from)}</opmeta:fromEntityId>\n`;
    rdf += `        <opmeta:toEntityId>${escapeXml(relationship.to)}</opmeta:toEntityId>\n`;
    rdf += '    </owl:ObjectProperty>\n\n';

    for (const attribute of relationship.attributes ?? []) {
      const attributeIri = `${baseUri}${relationship.id}_${attribute.name}`;
      rdf += `    <owl:DatatypeProperty rdf:about="${escapeXml(attributeIri)}">\n`;
      rdf += `        <rdfs:label>${escapeXml(attribute.name)}</rdfs:label>\n`;
      rdf += `        <rdfs:comment>Relationship attribute for ${escapeXml(relationship.name)}</rdfs:comment>\n`;
      rdf += `        <opmeta:relationshipAttributeOf>${escapeXml(relationship.id)}</opmeta:relationshipAttributeOf>\n`;
      rdf += `        <opmeta:attributeType>${escapeXml(attribute.type)}</opmeta:attributeType>\n`;
      rdf += '    </owl:DatatypeProperty>\n\n';
    }
  }

  if (bindings.length > 0) {
    rdf += '    <!-- Data Bindings -->\n';
    for (const binding of bindings) {
      const className = capitalize(binding.entityTypeId);
      rdf += `    <opmeta:DataBinding rdf:about="${escapeXml(baseUri + `binding_${binding.entityTypeId}`)}">\n`;
      rdf += `        <opmeta:boundClass rdf:resource="${escapeXml(baseUri + className)}"/>\n`;
      rdf += `        <opmeta:boundEntityId>${escapeXml(binding.entityTypeId)}</opmeta:boundEntityId>\n`;
      rdf += `        <opmeta:source>${escapeXml(binding.source)}</opmeta:source>\n`;
      rdf += `        <opmeta:table>${escapeXml(binding.table)}</opmeta:table>\n`;
      for (const [propertyName, columnName] of Object.entries(binding.columnMappings)) {
        rdf += `        <opmeta:columnMapping>${escapeXml(propertyName)}=${escapeXml(columnName)}</opmeta:columnMapping>\n`;
      }
      rdf += '    </opmeta:DataBinding>\n\n';
    }
  }

  rdf += '</rdf:RDF>\n';
  return rdf;
}

function associationClassIri(baseUri: string, relationship: Relationship): string {
  return `${baseUri}${capitalize(relationship.id)}Association`;
}

function cardinalityMaximums(cardinality: Relationship['cardinality']): {
  forward: boolean;
  inverse: boolean;
} {
  return {
    forward: cardinality === 'one-to-one' || cardinality === 'many-to-one',
    inverse: cardinality === 'one-to-one' || cardinality === 'one-to-many',
  };
}

function listNodeId(prefix: string, index: number): string {
  const safePrefix = prefix.replace(/[^A-Za-z0-9_.-]/g, '-');
  return `list-${safePrefix}-${index}`;
}

function serializeLiteralList(prefix: string, values: string[]): string {
  let rdf = '';
  values.forEach((value, index) => {
    const nodeId = listNodeId(prefix, index);
    rdf += `    <rdf:Description rdf:nodeID="${nodeId}">\n`;
    rdf += `        <rdf:first rdf:datatype="${XSD_NS}string">${escapeXml(value)}</rdf:first>\n`;
    if (index === values.length - 1) {
      rdf += `        <rdf:rest rdf:resource="${RDF_NS}nil"/>\n`;
    } else {
      rdf += `        <rdf:rest rdf:nodeID="${listNodeId(prefix, index + 1)}"/>\n`;
    }
    rdf += '    </rdf:Description>\n';
  });
  return rdf;
}

export function serializeStandardsRDF(ontology: Ontology): string {
  const baseUri = deriveBaseUri(ontology.name);
  const parentsByEntity = subclassParents(ontology);
  const enumLists: Array<{ prefix: string; values: string[] }> = [];
  let rdf = '<?xml version="1.0" encoding="UTF-8"?>\n';
  rdf += serializeNamespaces(
    baseUri,
    true,
    ontology.rdfMetadata !== undefined,
  );
  rdf += serializeOntologyDeclaration(ontology, baseUri);
  rdf += '    <!-- Standards-oriented OWL + SHACL profile. Playground-only UI metadata and bindings are omitted. -->\n\n';

  for (const entity of ontology.entityTypes) {
    const classIri = baseUri + capitalize(entity.id);
    const identifiers = entity.properties.filter((property) => property.isIdentifier);
    rdf += `    <owl:Class rdf:about="${escapeXml(classIri)}">\n`;
    rdf += `        <rdfs:label>${escapeXml(entity.name)}</rdfs:label>\n`;
    if (entity.description) {
      rdf += `        <rdfs:comment>${escapeXml(entity.description)}</rdfs:comment>\n`;
    }
    for (const parentId of parentsByEntity.get(entity.id) ?? []) {
      rdf += `        <rdfs:subClassOf rdf:resource="${escapeXml(baseUri + capitalize(parentId))}"/>\n`;
    }
    if (identifiers.length > 0) {
      rdf += '        <owl:hasKey rdf:parseType="Collection">\n';
      for (const property of identifiers) {
        rdf += `            <rdf:Description rdf:about="${escapeXml(propertyIri(baseUri, entity.id, property.name))}"/>\n`;
      }
      rdf += '        </owl:hasKey>\n';
    }
    rdf += '    </owl:Class>\n\n';
  }

  for (const entity of ontology.entityTypes) {
    const classIri = baseUri + capitalize(entity.id);
    entity.properties.forEach((property) => {
      const iri = propertyIri(baseUri, entity.id, property.name);
      const xsdType = XSD_TYPE_MAP[property.type] || 'string';
      rdf += `    <owl:DatatypeProperty rdf:about="${escapeXml(iri)}">\n`;
      rdf += `        <rdfs:label>${escapeXml(property.name)}</rdfs:label>\n`;
      rdf += `        <rdfs:domain rdf:resource="${escapeXml(classIri)}"/>\n`;
      rdf += `        <rdfs:range rdf:resource="${XSD_NS}${xsdType}"/>\n`;
      if (property.description) {
        rdf += `        <rdfs:comment>${escapeXml(property.description)}</rdfs:comment>\n`;
      }
      rdf += '    </owl:DatatypeProperty>\n\n';
    });
  }

  for (const relationship of ontology.relationships) {
    if (relationship.kind === 'subclass') continue;
    const relationshipIri = baseUri + relationship.id;
    rdf += `    <owl:ObjectProperty rdf:about="${escapeXml(relationshipIri)}">\n`;
    rdf += `        <rdfs:label>${escapeXml(relationship.name)}</rdfs:label>\n`;
    rdf += `        <rdfs:domain rdf:resource="${escapeXml(baseUri + capitalize(relationship.from))}"/>\n`;
    rdf += `        <rdfs:range rdf:resource="${escapeXml(baseUri + capitalize(relationship.to))}"/>\n`;
    if (relationship.description) {
      rdf += `        <rdfs:comment>${escapeXml(relationship.description)}</rdfs:comment>\n`;
    }
    rdf += '    </owl:ObjectProperty>\n\n';

    if ((relationship.attributes?.length ?? 0) > 0) {
      const associationIri = associationClassIri(baseUri, relationship);
      rdf += `    <owl:Class rdf:about="${escapeXml(associationIri)}">\n`;
      rdf += `        <rdfs:label>${escapeXml(`${relationship.name} association`)}</rdfs:label>\n`;
      rdf += `        <rdfs:subClassOf rdf:resource="${RDF_NS}Statement"/>\n`;
      rdf += `        <dcterms:relation rdf:resource="${escapeXml(relationshipIri)}"/>\n`;
      rdf += '        <rdfs:subClassOf>\n';
      rdf += '            <owl:Restriction>\n';
      rdf += `                <owl:onProperty rdf:resource="${RDF_NS}subject"/>\n`;
      rdf += `                <owl:allValuesFrom rdf:resource="${escapeXml(baseUri + capitalize(relationship.from))}"/>\n`;
      rdf += '            </owl:Restriction>\n';
      rdf += '        </rdfs:subClassOf>\n';
      rdf += '        <rdfs:subClassOf>\n';
      rdf += '            <owl:Restriction>\n';
      rdf += `                <owl:onProperty rdf:resource="${RDF_NS}predicate"/>\n`;
      rdf += `                <owl:hasValue rdf:resource="${escapeXml(relationshipIri)}"/>\n`;
      rdf += '            </owl:Restriction>\n';
      rdf += '        </rdfs:subClassOf>\n';
      rdf += '        <rdfs:subClassOf>\n';
      rdf += '            <owl:Restriction>\n';
      rdf += `                <owl:onProperty rdf:resource="${RDF_NS}object"/>\n`;
      rdf += `                <owl:allValuesFrom rdf:resource="${escapeXml(baseUri + capitalize(relationship.to))}"/>\n`;
      rdf += '            </owl:Restriction>\n';
      rdf += '        </rdfs:subClassOf>\n';
      rdf += '    </owl:Class>\n\n';

      for (const attribute of relationship.attributes ?? []) {
        const attributeIri = `${baseUri}${relationship.id}_attribute_${attribute.name}`;
        const xsdType = XSD_TYPE_MAP[attribute.type] || 'string';
        rdf += `    <owl:DatatypeProperty rdf:about="${escapeXml(attributeIri)}">\n`;
        rdf += `        <rdfs:label>${escapeXml(attribute.name)}</rdfs:label>\n`;
        rdf += `        <rdfs:domain rdf:resource="${escapeXml(associationIri)}"/>\n`;
        rdf += `        <rdfs:range rdf:resource="${XSD_NS}${xsdType}"/>\n`;
        rdf += '    </owl:DatatypeProperty>\n\n';
      }
    }
  }

  rdf += '    <!-- SHACL property order, enums, identifiers, and relationship cardinality -->\n';
  for (const [entityIndex, entity] of ontology.entityTypes.entries()) {
    const classIri = baseUri + capitalize(entity.id);
    entity.properties.forEach((property, propertyIndex) => {
      const iri = propertyIri(baseUri, entity.id, property.name);
      const shapeIri = `${baseUri}shape_property_${entityIndex}_${propertyIndex}`;
      const xsdType = XSD_TYPE_MAP[property.type] || 'string';
      rdf += `    <sh:PropertyShape rdf:about="${escapeXml(shapeIri)}">\n`;
      rdf += `        <sh:targetClass rdf:resource="${escapeXml(classIri)}"/>\n`;
      rdf += `        <sh:path rdf:resource="${escapeXml(iri)}"/>\n`;
      rdf += `        <sh:datatype rdf:resource="${XSD_NS}${xsdType}"/>\n`;
      rdf += `        <sh:order rdf:datatype="${XSD_NS}decimal">${propertyIndex}</sh:order>\n`;
      if (property.isIdentifier) {
        rdf += `        <sh:minCount rdf:datatype="${XSD_NS}integer">1</sh:minCount>\n`;
        rdf += `        <sh:maxCount rdf:datatype="${XSD_NS}integer">1</sh:maxCount>\n`;
      }
      if (property.values && property.values.length > 0) {
        const prefix = `enum-${entityIndex}-${propertyIndex}`;
        rdf += `        <sh:in rdf:nodeID="${listNodeId(prefix, 0)}"/>\n`;
        enumLists.push({ prefix, values: property.values });
      }
      rdf += '    </sh:PropertyShape>\n\n';
    });
  }

  for (const relationship of ontology.relationships) {
    if (relationship.kind === 'subclass') continue;
    const relationshipIri = baseUri + relationship.id;
    const maximums = cardinalityMaximums(relationship.cardinality);
    rdf += `    <sh:PropertyShape rdf:about="${escapeXml(`${baseUri}shape_${relationship.id}_forward`)}">\n`;
    rdf += `        <sh:targetClass rdf:resource="${escapeXml(baseUri + capitalize(relationship.from))}"/>\n`;
    rdf += `        <sh:path rdf:resource="${escapeXml(relationshipIri)}"/>\n`;
    rdf += `        <sh:class rdf:resource="${escapeXml(baseUri + capitalize(relationship.to))}"/>\n`;
    if (maximums.forward) {
      rdf += `        <sh:maxCount rdf:datatype="${XSD_NS}integer">1</sh:maxCount>\n`;
    }
    rdf += '    </sh:PropertyShape>\n\n';

    rdf += `    <sh:PropertyShape rdf:about="${escapeXml(`${baseUri}shape_${relationship.id}_inverse`)}">\n`;
    rdf += `        <sh:targetClass rdf:resource="${escapeXml(baseUri + capitalize(relationship.to))}"/>\n`;
    rdf += '        <sh:path rdf:parseType="Resource">\n';
    rdf += `            <sh:inversePath rdf:resource="${escapeXml(relationshipIri)}"/>\n`;
    rdf += '        </sh:path>\n';
    rdf += `        <sh:class rdf:resource="${escapeXml(baseUri + capitalize(relationship.from))}"/>\n`;
    if (maximums.inverse) {
      rdf += `        <sh:maxCount rdf:datatype="${XSD_NS}integer">1</sh:maxCount>\n`;
    }
    rdf += '    </sh:PropertyShape>\n\n';

    const associationIri = associationClassIri(baseUri, relationship);
    for (const [attributeIndex, attribute] of (relationship.attributes ?? []).entries()) {
      const attributeIri = `${baseUri}${relationship.id}_attribute_${attribute.name}`;
      rdf += `    <sh:PropertyShape rdf:about="${escapeXml(`${baseUri}shape_${relationship.id}_attribute_${attribute.name}`)}">\n`;
      rdf += `        <sh:targetClass rdf:resource="${escapeXml(associationIri)}"/>\n`;
      rdf += `        <sh:path rdf:resource="${escapeXml(attributeIri)}"/>\n`;
      rdf += `        <sh:order rdf:datatype="${XSD_NS}decimal">${attributeIndex}</sh:order>\n`;
      rdf += '    </sh:PropertyShape>\n\n';
    }
  }

  for (const list of enumLists) {
    rdf += serializeLiteralList(list.prefix, list.values);
  }

  rdf += '</rdf:RDF>\n';
  return rdf;
}

export function serializeToRDF(
  ontology: Ontology,
  bindings: DataBinding[] = [],
  options: RdfSerializationOptions = {},
): string {
  return options.profile === 'standards'
    ? serializeStandardsRDF(ontology)
    : serializePlaygroundRDF(ontology, bindings);
}
