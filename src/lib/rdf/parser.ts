import type {
  Ontology,
  EntityType,
  Property,
  Relationship,
  RelationshipAttribute,
  DataBinding,
} from '../../data/ontology';

export class RDFParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RDFParseError';
  }
}

/**
 * Get the text content of a child element by local name within a parent element.
 * Searches across common RDF/OWL namespaces.
 */
function getChildText(
  parent: Element,
  localName: string,
  namespace?: string,
): string | null {
  // Try namespace-aware lookup first
  if (namespace) {
    const els = parent.getElementsByTagNameNS(namespace, localName);
    if (els.length > 0) return els[0].textContent;
  }

  // Fallback: try all children by local name match
  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children[i];
    const childLocal = child.localName || child.tagName.split(':').pop();
    if (childLocal === localName) {
      return child.textContent;
    }
  }
  return null;
}

/**
 * Get the rdf:resource attribute from a child element.
 */
function getChildResource(
  parent: Element,
  localName: string,
): string | null {
  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children[i];
    const childLocal = child.localName || child.tagName.split(':').pop();
    if (childLocal === localName) {
      return (
        child.getAttribute('rdf:resource') ||
        child.getAttributeNS('http://www.w3.org/1999/02/22-rdf-syntax-ns#', 'resource')
      );
    }
  }
  return null;
}

/**
 * Get all rdf:resource attribute values from children with a given local name.
 * Children without an rdf:resource attribute (e.g. nested owl:Restriction
 * nodes) are ignored.
 */
function getChildResources(
  parent: Element,
  localName: string,
  namespace?: string,
): string[] {
  const results: string[] = [];
  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children[i];
    const childLocal = child.localName || child.tagName.split(':').pop();
    if (childLocal !== localName || (namespace && child.namespaceURI !== namespace)) continue;
    const resource =
      child.getAttribute('rdf:resource') ||
      child.getAttributeNS(RDF_NS, 'resource');
    if (resource) results.push(resource);
  }
  return results;
}

/**
 * Get all text values from children with a given local name.
 */
function getChildTexts(parent: Element, localName: string): string[] {
  const results: string[] = [];
  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children[i];
    const childLocal = child.localName || child.tagName.split(':').pop();
    if (childLocal === localName && child.textContent) {
      results.push(child.textContent);
    }
  }
  return results;
}

/**
 * Extract the local name (fragment) from a URI.
 * e.g., "http://example.org/ontology/foo/Customer" → "Customer"
 */
function localNameFromUri(uri: string): string {
  const hashIdx = uri.lastIndexOf('#');
  if (hashIdx >= 0) return uri.substring(hashIdx + 1);
  const slashIdx = uri.lastIndexOf('/');
  if (slashIdx >= 0) return uri.substring(slashIdx + 1);
  return uri;
}

/**
 * Uncapitalize the first character.
 */
function uncapitalize(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

function createUniqueId(baseId: string, usedIds: Set<string>): string {
  const base = baseId || 'resource';
  let candidate = base;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

const VALID_PROPERTY_TYPES = ['string', 'integer', 'decimal', 'double', 'date', 'datetime', 'boolean', 'enum'] as const;
type PropertyType = (typeof VALID_PROPERTY_TYPES)[number];

function isValidPropertyType(t: string): t is PropertyType {
  return (VALID_PROPERTY_TYPES as readonly string[]).includes(t);
}

const XSD_TO_TYPE: Record<string, PropertyType> = {
  string: 'string',
  integer: 'integer',
  int: 'integer',
  long: 'integer',
  decimal: 'decimal',
  float: 'decimal',
  double: 'double',
  date: 'date',
  dateTime: 'datetime',
  boolean: 'boolean',
};

const VALID_CARDINALITIES = ['one-to-one', 'one-to-many', 'many-to-one', 'many-to-many'] as const;
type Cardinality = (typeof VALID_CARDINALITIES)[number];

function isValidCardinality(c: string): c is Cardinality {
  return (VALID_CARDINALITIES as readonly string[]).includes(c);
}

const RDF_NS = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS_NS = 'http://www.w3.org/2000/01/rdf-schema#';
const OWL_NS = 'http://www.w3.org/2002/07/owl#';
const SHACL_NS = 'http://www.w3.org/ns/shacl#';

/**
 * Collect all elements declaring a resource of the given type, supporting both
 * RDF/XML syntaxes:
 *
 *  1. Typed node elements:       `<owl:Class rdf:about="...">`
 *  2. rdf:Description elements:  `<rdf:Description rdf:about="...">`
 *                                `  <rdf:type rdf:resource=".../owl#Class"/>`
 *
 * Many serializers (e.g. Python's rdflib, used by Brick and other published
 * ontologies) emit only the second form, which we previously ignored (#85).
 */
interface RdfNodeIndex {
  descriptionsByType: Map<string, Element[]>;
  nodesById: Map<string, Element>;
}

function indexRdfNodes(root: Element): RdfNodeIndex {
  const descriptionsByType = new Map<string, Element[]>();
  const nodesById = new Map<string, Element>();
  const descriptions = root.getElementsByTagNameNS(RDF_NS, 'Description');

  for (let i = 0; i < descriptions.length; i++) {
    const element = descriptions[i];
    const nodeId = getRdfAttribute(element, 'nodeID');
    if (nodeId) nodesById.set(nodeId, element);

    const indexedTypes = new Set<string>();
    for (let j = 0; j < element.children.length; j++) {
      const child = element.children[j];
      if (child.namespaceURI !== RDF_NS || child.localName !== 'type') continue;
      const resource =
        child.getAttribute('rdf:resource') || child.getAttributeNS(RDF_NS, 'resource');
      if (!resource || indexedTypes.has(resource)) continue;
      indexedTypes.add(resource);
      const elements = descriptionsByType.get(resource) ?? [];
      elements.push(element);
      descriptionsByType.set(resource, elements);
    }
  }

  const lists = root.getElementsByTagNameNS(RDF_NS, 'List');
  for (let i = 0; i < lists.length; i++) {
    const nodeId = getRdfAttribute(lists[i], 'nodeID');
    if (nodeId) nodesById.set(nodeId, lists[i]);
  }

  return { descriptionsByType, nodesById };
}

function getTypedElements(
  root: Element,
  namespace: string,
  localName: string,
  descriptionTypeIndex: Map<string, Element[]>,
): Element[] {
  const results: Element[] = Array.from(root.getElementsByTagNameNS(namespace, localName));
  const typeUri = namespace + localName;
  results.push(...(descriptionTypeIndex.get(typeUri) ?? []));
  return results;
}

function getRdfAttribute(element: Element, localName: string): string | null {
  return (
    element.getAttribute(`rdf:${localName}`)
    || element.getAttributeNS(RDF_NS, localName)
  );
}

function getDirectChild(parent: Element, localName: string): Element | null {
  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children[i];
    const childLocal = child.localName || child.tagName.split(':').pop();
    if (childLocal === localName) return child;
  }
  return null;
}

function getCollectionResources(
  parent: Element,
  localName: string,
  nodesById: ReadonlyMap<string, Element>,
): string[] {
  const collection = getDirectChild(parent, localName);
  if (!collection) return [];

  const listNodeId = getRdfAttribute(collection, 'nodeID');
  if (listNodeId) {
    return (parseRdfList(listNodeId, nodesById) ?? [])
      .map((item) => item.resource)
      .filter((resource): resource is string => Boolean(resource));
  }

  const resources: string[] = [];
  for (let i = 0; i < collection.children.length; i++) {
    const resource = (
      getRdfAttribute(collection.children[i], 'about')
      || getRdfAttribute(collection.children[i], 'resource')
    );
    if (resource) resources.push(resource);
  }
  return resources;
}

interface ShaclPathMetadata {
  enumValues?: string[];
  forwardMaxOne: boolean;
  hasForwardShape: boolean;
  hasInverseShape: boolean;
  inverseMaxOne: boolean;
  order?: number;
}

interface RdfListItem {
  literal: string | null;
  resource: string | null;
}

function parseRdfList(
  startNodeId: string,
  nodesById: ReadonlyMap<string, Element>,
): RdfListItem[] | null {
  const values: RdfListItem[] = [];
  const visited = new Set<string>();
  let nodeId: string | null = startNodeId;

  while (nodeId && !visited.has(nodeId)) {
    visited.add(nodeId);
    const node = nodesById.get(nodeId);
    if (!node) return null;

    const first = getDirectChild(node, 'first');
    const rest = getDirectChild(node, 'rest');
    if (!first || !rest) return null;

    const resource = getRdfAttribute(first, 'resource');
    values.push({
      literal: resource ? null : first.textContent,
      resource,
    });

    const restResource = getRdfAttribute(rest, 'resource');
    if (restResource === `${RDF_NS}nil`) return values;

    nodeId = getRdfAttribute(rest, 'nodeID');
    if (!nodeId) return null;
  }

  return null;
}

function parseShaclPathMetadata(
  root: Element,
  descriptionTypeIndex: Map<string, Element[]>,
  nodesById: ReadonlyMap<string, Element>,
): Map<string, ShaclPathMetadata> {
  const metadataByPath = new Map<string, ShaclPathMetadata>();
  const propertyShapes = getTypedElements(
    root,
    SHACL_NS,
    'PropertyShape',
    descriptionTypeIndex,
  );

  for (const shape of propertyShapes) {
    const path = getDirectChild(shape, 'path');
    if (!path) continue;

    const inlinePathNode = path.children.length === 1
      ? path.children[0]
      : undefined;
    let pathUri = (
      getRdfAttribute(path, 'resource')
      || (inlinePathNode ? getRdfAttribute(inlinePathNode, 'about') : null)
    );
    let inverse = false;
    if (!pathUri) {
      const pathNodeId = getRdfAttribute(path, 'nodeID');
      const pathNode = (
        (pathNodeId ? nodesById.get(pathNodeId) : undefined)
        || inlinePathNode
      );
      const inversePath = (
        getDirectChild(path, 'inversePath')
        || (pathNode ? getDirectChild(pathNode, 'inversePath') : null)
      );
      pathUri = inversePath ? getRdfAttribute(inversePath, 'resource') : null;
      inverse = Boolean(pathUri);
    }
    if (!pathUri) continue;

    const metadata = metadataByPath.get(pathUri) ?? {
      forwardMaxOne: false,
      hasForwardShape: false,
      hasInverseShape: false,
      inverseMaxOne: false,
    };
    const maxCount = Number(getChildText(shape, 'maxCount', SHACL_NS));

    if (inverse) {
      metadata.hasInverseShape = true;
      metadata.inverseMaxOne ||= maxCount === 1;
    } else {
      metadata.hasForwardShape = true;
      metadata.forwardMaxOne ||= maxCount === 1;

      const orderText = getChildText(shape, 'order', SHACL_NS);
      if (orderText !== null && Number.isFinite(Number(orderText))) {
        metadata.order = Number(orderText);
      }

      const inList = getDirectChild(shape, 'in');
      const listNodeId = inList ? getRdfAttribute(inList, 'nodeID') : null;
      const list = listNodeId ? parseRdfList(listNodeId, nodesById) : null;
      if (list) {
        const enumValues = list
          .map((item) => item.literal)
          .filter((value): value is string => value !== null);
        if (enumValues.length === list.length) {
          metadata.enumValues = enumValues;
        }
      }
    }

    metadataByPath.set(pathUri, metadata);
  }

  return metadataByPath;
}

interface ParsedDatatypeProperty {
  about: string;
  label: string;
  domainUri: string | null;
  rangeUri: string | null;
  comment: string | null;
  isIdentifier: boolean;
  unit: string | null;
  enumConstraint: boolean;
  enumValues: string[] | null;
  propertyType: string | null;
  relationshipAttributeOf: string | null;
  attributeType: string | null;
  order: number | null;
}

function inferPropertyType(property: ParsedDatatypeProperty): PropertyType {
  if (property.propertyType && isValidPropertyType(property.propertyType)) {
    return property.propertyType;
  }
  if (property.enumConstraint) return 'enum';
  if (property.rangeUri) {
    const xsdLocal = localNameFromUri(property.rangeUri);
    if (XSD_TO_TYPE[xsdLocal]) return XSD_TO_TYPE[xsdLocal];
  }
  return 'string';
}

/**
 * Parse an RDF/XML (OWL) string into an Ontology and optional DataBindings.
 */
export function parseRDF(rdfXml: string): { ontology: Ontology; bindings: DataBinding[] } {
  // Give Turtle input a clear, actionable error instead of an XML parse error.
  const sniff = rdfXml.trimStart();
  if (!sniff.startsWith('<') && /^(@prefix|@base|PREFIX\s|BASE\s)/m.test(sniff)) {
    throw new RDFParseError(
      'This file appears to be Turtle (.ttl), which is not supported yet. ' +
      'Please convert it to RDF/XML first (for example with Apache Jena "riot" or an online RDF converter).'
    );
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(rdfXml, 'application/xml');

  // Check for XML parse errors
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new RDFParseError(`Malformed XML: ${parseError.textContent?.trim() || 'parse error'}`);
  }

  const root = doc.documentElement;
  const rdfNodeIndex = indexRdfNodes(root);
  const descriptionTypeIndex = rdfNodeIndex.descriptionsByType;
  const shaclPathMetadata = parseShaclPathMetadata(
    root,
    descriptionTypeIndex,
    rdfNodeIndex.nodesById,
  );

  // --- Extract ontology metadata ---
  let ontologyName = '';
  let ontologyDescription = '';

  const ontologyEls = getTypedElements(root, OWL_NS, 'Ontology', descriptionTypeIndex);
  if (ontologyEls.length > 0) {
    const ontEl = ontologyEls[0];
    ontologyName = getChildText(ontEl, 'label', RDFS_NS) || '';
    ontologyDescription = getChildText(ontEl, 'comment', RDFS_NS) || '';
  }

  // --- Extract OWL Classes → EntityTypes ---
  const classEls = getTypedElements(root, OWL_NS, 'Class', descriptionTypeIndex);
  const objPropEls = getTypedElements(
    root,
    OWL_NS,
    'ObjectProperty',
    descriptionTypeIndex,
  );
  const objectPropertyUris = new Set(
    objPropEls
      .map((element) => getRdfAttribute(element, 'about'))
      .filter((uri): uri is string => Boolean(uri)),
  );
  const entityMap = new Map<string, EntityType>();
  const usedEntityIds = new Set<string>();
  const associationRelationshipByClass = new Map<string, string>();
  const identifierPropertiesByClass = new Map<string, Set<string>>();

  for (const el of classEls) {
    const about = getRdfAttribute(el, 'about') || '';
    if (!about) continue;

    const isStatementAssociation = getChildResources(el, 'subClassOf')
      .includes(`${RDF_NS}Statement`);
    const relatedRelationship = getChildResource(el, 'relation');
    if (
      isStatementAssociation
      && relatedRelationship
      && objectPropertyUris.has(relatedRelationship)
    ) {
      associationRelationshipByClass.set(
        about,
        localNameFromUri(relatedRelationship),
      );
    }

    const identifierProperties = getCollectionResources(
      el,
      'hasKey',
      rdfNodeIndex.nodesById,
    );
    if (identifierProperties.length > 0) {
      identifierPropertiesByClass.set(about, new Set(identifierProperties));
    }
  }

  for (let i = 0; i < classEls.length; i++) {
    const el = classEls[i];
    const about = getRdfAttribute(el, 'about') || '';
    if (!about || associationRelationshipByClass.has(about)) continue;

    const className = localNameFromUri(about);
    const existingEntity = entityMap.get(about);
    const entityId = existingEntity?.id
      ?? createUniqueId(uncapitalize(className) || 'entity', usedEntityIds);
    const label = getChildText(el, 'label', RDFS_NS) || className;
    const description = getChildText(el, 'comment', RDFS_NS) || '';
    const icon = getChildText(el, 'icon') || '📦';
    const color = getChildText(el, 'color') || '#0078D4';

    entityMap.set(about, {
      id: entityId,
      name: label,
      description,
      icon,
      color,
      properties: [],
    });
  }

  // --- Extract DatatypeProperties → Properties + Relationship Attributes ---
  const dtPropEls = getTypedElements(
    root,
    OWL_NS,
    'DatatypeProperty',
    descriptionTypeIndex,
  );
  const parsedDtProps: ParsedDatatypeProperty[] = [];

  for (let i = 0; i < dtPropEls.length; i++) {
    const el = dtPropEls[i];
    const about = getRdfAttribute(el, 'about') || '';
    if (!about) continue;

    const comments = getChildTexts(el, 'comment');
    const hasIdentifierComment = comments.some(c => /^identifier\s+property$/i.test(c.trim()));
    const descriptionComment = comments.find(c => !/^identifier\s+property$/i.test(c.trim())) ?? null;
    const domainUri = getChildResource(el, 'domain');
    const legacyEnumValues = getChildText(el, 'enumValues');
    const shapeMetadata = shaclPathMetadata.get(about);

    parsedDtProps.push({
      about,
      label: getChildText(el, 'label', RDFS_NS) || localNameFromUri(about),
      domainUri,
      rangeUri: getChildResource(el, 'range'),
      comment: descriptionComment,
      isIdentifier: (
        getChildText(el, 'isIdentifier') === 'true'
        || hasIdentifierComment
        || Boolean(
          domainUri
          && identifierPropertiesByClass.get(domainUri)?.has(about),
        )
      ),
      unit: getChildText(el, 'unit'),
      enumConstraint: Boolean(shapeMetadata?.enumValues),
      enumValues: (
        shapeMetadata?.enumValues
        || (legacyEnumValues ? legacyEnumValues.split(',') : null)
      ),
      propertyType: getChildText(el, 'propertyType'),
      relationshipAttributeOf: getChildText(el, 'relationshipAttributeOf'),
      attributeType: getChildText(el, 'attributeType'),
      order: shapeMetadata?.order ?? null,
    });
  }

  // Collect relationship attributes separately
  const relAttrMap = new Map<string, RelationshipAttribute[]>();
  const orderByEntityProperty = new WeakMap<Property, number>();
  const orderByRelationshipAttribute = new WeakMap<RelationshipAttribute, number>();

  for (const dtProp of parsedDtProps) {
    const associationRelationship = dtProp.domainUri
      ? associationRelationshipByClass.get(dtProp.domainUri)
      : undefined;
    const attributeRelationship = (
      dtProp.relationshipAttributeOf
      || associationRelationship
    );
    if (attributeRelationship) {
      const relId = attributeRelationship;
      if (!relAttrMap.has(relId)) {
        relAttrMap.set(relId, []);
      }
      const attribute: RelationshipAttribute = {
        name: dtProp.label,
        type: dtProp.attributeType || inferPropertyType(dtProp),
      };
      if (dtProp.order !== null) {
        orderByRelationshipAttribute.set(attribute, dtProp.order);
      }
      relAttrMap.get(relId)!.push(attribute);
      continue;
    }

    // Regular entity property — match to entity by domain URI
    if (!dtProp.domainUri) continue;

    const entity = entityMap.get(dtProp.domainUri);
    if (!entity) continue;

    const prop: Property = {
      name: dtProp.label,
      type: inferPropertyType(dtProp),
    };

    if (dtProp.isIdentifier) prop.isIdentifier = true;
    if (dtProp.unit) prop.unit = dtProp.unit;
    if (dtProp.enumValues) {
      prop.values = dtProp.enumValues;
    }
    if (dtProp.comment) prop.description = dtProp.comment;
    if (dtProp.order !== null) {
      orderByEntityProperty.set(prop, dtProp.order);
    }

    entity.properties.push(prop);
  }

  for (const entity of entityMap.values()) {
    entity.properties.sort((left, right) => (
      (orderByEntityProperty.get(left) ?? Number.MAX_SAFE_INTEGER)
      - (orderByEntityProperty.get(right) ?? Number.MAX_SAFE_INTEGER)
    ));
  }
  for (const attributes of relAttrMap.values()) {
    attributes.sort((left, right) => (
      (orderByRelationshipAttribute.get(left) ?? Number.MAX_SAFE_INTEGER)
      - (orderByRelationshipAttribute.get(right) ?? Number.MAX_SAFE_INTEGER)
    ));
  }

  // --- Extract ObjectProperties → Relationships ---
  const relationships: Relationship[] = [];
  const usedRelationshipIds = new Set(usedEntityIds);

  for (let i = 0; i < objPropEls.length; i++) {
    const el = objPropEls[i];
    const about = getRdfAttribute(el, 'about') || '';
    if (!about) continue;

    const sourceRelId = localNameFromUri(about) || 'relationship';
    const relId = createUniqueId(sourceRelId, usedRelationshipIds);
    const label = getChildText(el, 'label', RDFS_NS) || sourceRelId;
    const description = getChildText(el, 'comment', RDFS_NS) || undefined;

    // Get from/to entity IDs — prefer explicit ont:fromEntityId/toEntityId,
    // fallback to domain/range URI.  Always uncapitalize to match entity IDs.
    let fromId = uncapitalize(getChildText(el, 'fromEntityId') || '');
    let toId = uncapitalize(getChildText(el, 'toEntityId') || '');

    if (!fromId) {
      const domainUri = getChildResource(el, 'domain');
      if (domainUri) {
        fromId = entityMap.get(domainUri)?.id
          ?? uncapitalize(localNameFromUri(domainUri));
      }
    }
    if (!toId) {
      const rangeUri = getChildResource(el, 'range');
      if (rangeUri) {
        toId = entityMap.get(rangeUri)?.id
          ?? uncapitalize(localNameFromUri(rangeUri));
      }
    }

    const cardinalityStr = getChildText(el, 'cardinality');
    const shapeMetadata = shaclPathMetadata.get(about);
    let cardinality: Cardinality = 'one-to-many';
    if (cardinalityStr && isValidCardinality(cardinalityStr)) {
      cardinality = cardinalityStr;
    } else if (
      shapeMetadata?.hasForwardShape
      || shapeMetadata?.hasInverseShape
    ) {
      if (shapeMetadata.forwardMaxOne && shapeMetadata.inverseMaxOne) {
        cardinality = 'one-to-one';
      } else if (shapeMetadata.forwardMaxOne) {
        cardinality = 'many-to-one';
      } else if (shapeMetadata.inverseMaxOne) {
        cardinality = 'one-to-many';
      } else {
        cardinality = 'many-to-many';
      }
    }

    const rel: Relationship = {
      id: relId,
      name: label,
      from: fromId,
      to: toId,
      cardinality,
    };

    if (description) rel.description = description;

    // Attach relationship attributes
    const attrs = relAttrMap.get(sourceRelId);
    if (attrs && attrs.length > 0) {
      rel.attributes = attrs;
    }

    // Skip relationships with unresolved source or target
    if (!rel.from || !rel.to) continue;

    relationships.push(rel);
  }

  // --- Extract rdfs:subClassOf hierarchy → Relationships (#101) ---
  // Many published ontologies (e.g. Brick) carry little or no
  // rdfs:domain/rdfs:range on their object properties; their dominant graph
  // structure is the class taxonomy. Surface it as relationships so imported
  // hierarchies are visible instead of rendering as disconnected nodes.
  const seenSubClassEdges = new Set<string>();

  for (let i = 0; i < classEls.length; i++) {
    const el = classEls[i];
    const about = el.getAttribute('rdf:about') || el.getAttributeNS(RDF_NS, 'about') || '';
    if (!about) continue;

    const subEntity = entityMap.get(about);
    if (!subEntity) continue;

    const superUris = getChildResources(el, 'subClassOf', RDFS_NS);
    for (const superUri of superUris) {
      // Only link classes that were imported as entities; skip external
      // references (owl:Thing, other vocabularies) and self-references.
      const superEntity = entityMap.get(superUri);
      if (!superEntity || superEntity === subEntity) continue;

      const edgeKey = `${subEntity.id}\u0000${superEntity.id}`;
      if (seenSubClassEdges.has(edgeKey)) continue;
      seenSubClassEdges.add(edgeKey);

      relationships.push({
        id: createUniqueId(
          `${subEntity.id}-subClassOf-${superEntity.id}`,
          usedRelationshipIds,
        ),
        name: 'subClassOf',
        from: subEntity.id,
        to: superEntity.id,
        cardinality: 'many-to-one',
        kind: 'subclass',
      });
    }
  }

  // --- Extract DataBindings ---
  const bindings: DataBinding[] = [];
  // DataBinding uses the ontology's own namespace, so match by local name.
  const dataBindingElements = root.getElementsByTagNameNS('*', 'DataBinding');
  for (let i = 0; i < dataBindingElements.length; i++) {
    const el = dataBindingElements[i];

    const entityId = getChildText(el, 'boundEntityId') || '';
    const source = getChildText(el, 'source') || '';
    const table = getChildText(el, 'table') || '';
    const mappingTexts = getChildTexts(el, 'columnMapping');

    const columnMappings: Record<string, string> = {};
    for (const mapping of mappingTexts) {
      const eqIdx = mapping.indexOf('=');
      if (eqIdx > 0) {
        columnMappings[mapping.substring(0, eqIdx)] = mapping.substring(eqIdx + 1);
      }
    }

    if (entityId) {
      bindings.push({ entityTypeId: entityId, source, table, columnMappings });
    }
  }

  // --- Build the Ontology ---
  const entityTypes = Array.from(entityMap.values());

  if (!ontologyName && entityTypes.length === 0) {
    throw new RDFParseError('No ontology metadata or OWL classes found in the RDF document.');
  }

  const ontology: Ontology = {
    name: ontologyName || 'Imported Ontology',
    description: ontologyDescription,
    entityTypes,
    relationships,
  };

  return { ontology, bindings };
}
