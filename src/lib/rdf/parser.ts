import type {
  Ontology,
  EntityType,
  Property,
  Relationship,
  RelationshipAttribute,
  DataBinding,
  OntologyRdfMetadata,
} from '../../data/ontology';
import type {
  RdfNamedNode,
  RdfProjectionMap,
} from '../../types/rdfDocument';
import { resolveRdfIri } from './iri';

export interface RdfParseOptions {
  allowEmptyProjection?: boolean;
  baseIri?: string;
}

export interface RdfParseResult {
  ontology: Ontology;
  bindings: DataBinding[];
  projection: RdfProjectionMap;
}

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
    for (let index = 0; index < els.length; index += 1) {
      if (!isInsideXmlLiteralProperty(els[index], parent)) {
        return els[index].textContent;
      }
    }
  }

  // Fallback: try all children by local name match
  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children[i];
    const childLocal = child.localName || child.tagName.split(':').pop();
    if (
      childLocal === localName
      && !isInsideXmlLiteralProperty(child, parent)
    ) {
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
  namespace?: string,
): string | null {
  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children[i];
    const childLocal = child.localName || child.tagName.split(':').pop();
    if (
      childLocal === localName
      && (namespace === undefined || child.namespaceURI === namespace)
      && !isInsideXmlLiteralProperty(child, parent)
    ) {
      return child.getAttributeNS(
        'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
        'resource',
      );
    }
  }
  return null;
}

function getDirectChildText(
  parent: Element,
  localName: string,
  namespace: string,
): string | null {
  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children[i];
    if (
      child.localName === localName
      && child.namespaceURI === namespace
      && !isInsideXmlLiteralProperty(child, parent)
    ) {
      return child.textContent;
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
    if (
      childLocal !== localName
      || (namespace && child.namespaceURI !== namespace)
      || isInsideXmlLiteralProperty(child, parent)
    ) continue;
    const resource = child.getAttributeNS(RDF_NS, 'resource');
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
    if (
      childLocal === localName
      && child.textContent
      && !isInsideXmlLiteralProperty(child, parent)
    ) {
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
const DCTERMS_NS = 'http://purl.org/dc/terms/';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const PLAYGROUND_METADATA_NS =
  'https://microsoft.github.io/Ontology-Playground/ns/metadata#';

function isXmlLiteralProperty(element: Element): boolean {
  const parseType = element.getAttributeNS(RDF_NS, 'parseType');
  return parseType !== null
    && parseType !== 'Resource'
    && parseType !== 'Collection'
    && parseType !== 'Triple';
}

function isInsideXmlLiteralProperty(
  element: Element,
  boundary: Element,
): boolean {
  let current: Element | null = element;
  while (current && current !== boundary) {
    if (isXmlLiteralProperty(current)) return true;
    current = current.parentElement;
  }
  return false;
}

function resolveProjectionIri(
  value: string,
  baseIri: string | undefined,
): RdfNamedNode {
  return {
    termType: 'NamedNode',
    value: resolveRdfIri(value, baseIri),
  };
}

function hasNestedXmlBase(
  element: Element,
  root: Element,
): boolean {
  let current: Element | null = element;
  while (current && current !== root) {
    if (current.hasAttributeNS(XML_NS, 'base')) return true;
    current = current.parentElement;
  }
  return false;
}

function childResourceHasXmlBase(
  parent: Element,
  localName: string,
  namespace: string,
  resource: string,
): boolean {
  for (let index = 0; index < parent.children.length; index += 1) {
    const child = parent.children[index];
    if (
      child.localName === localName
      && child.namespaceURI === namespace
      && child.getAttributeNS(RDF_NS, 'resource') === resource
      && child.hasAttributeNS(XML_NS, 'base')
    ) {
      return true;
    }
  }
  return false;
}

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

function getElementsIncludingRoot(
  root: Element,
  namespace: string,
  localName: string,
): Element[] {
  const rootMatches =
    (namespace === '*' || root.namespaceURI === namespace)
    && (localName === '*' || root.localName === localName);
  return [
    ...(rootMatches ? [root] : []),
    ...Array.from(root.getElementsByTagNameNS(namespace, localName)),
  ].filter((element) => !isInsideXmlLiteralProperty(element, root));
}

function indexRdfNodes(root: Element): RdfNodeIndex {
  const descriptionsByType = new Map<string, Element[]>();
  const nodesById = new Map<string, Element>();
  const descriptions = getElementsIncludingRoot(
    root,
    RDF_NS,
    'Description',
  );

  for (let i = 0; i < descriptions.length; i++) {
    const element = descriptions[i];
    const nodeId = getRdfAttribute(element, 'nodeID');
    if (nodeId) nodesById.set(nodeId, element);

    const indexedTypes = new Set<string>();
    for (let j = 0; j < element.children.length; j++) {
      const child = element.children[j];
      if (
        child.namespaceURI !== RDF_NS
        || child.localName !== 'type'
        || isInsideXmlLiteralProperty(child, element)
      ) continue;
      const resource = child.getAttributeNS(RDF_NS, 'resource');
      if (!resource || indexedTypes.has(resource)) continue;
      indexedTypes.add(resource);
      const elements = descriptionsByType.get(resource) ?? [];
      elements.push(element);
      descriptionsByType.set(resource, elements);
    }
  }

  const lists = getElementsIncludingRoot(root, RDF_NS, 'List');
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
  const results = getElementsIncludingRoot(root, namespace, localName);
  const typeUri = namespace + localName;
  results.push(...(descriptionTypeIndex.get(typeUri) ?? []));
  return results;
}

function getRdfAttribute(element: Element, localName: string): string | null {
  return element.getAttributeNS(RDF_NS, localName);
}

interface ProjectionNodeIdentity {
  reference: string;
  term: RdfNamedNode | null;
}

function getProjectionNodeIdentity(
  element: Element,
  baseIri: string | undefined,
): ProjectionNodeIdentity | null {
  const about = getRdfAttribute(element, 'about');
  if (about !== null) {
    return {
      reference: about,
      term: resolveProjectionIri(about, baseIri),
    };
  }

  const id = getRdfAttribute(element, 'ID');
  if (id) {
    const reference = `#${id}`;
    return {
      reference,
      term: resolveProjectionIri(reference, baseIri),
    };
  }

  const nodeId = getRdfAttribute(element, 'nodeID');
  if (
    nodeId
    && element.ownerDocument.documentElement === element
  ) {
    return {
      reference: `_:${nodeId}`,
      term: null,
    };
  }

  return null;
}

function projectionIdentityKey(identity: ProjectionNodeIdentity): string {
  return identity.term?.value ?? identity.reference;
}

function resolveProjectionReference(
  value: string | null,
  baseIri: string | undefined,
): string | null {
  return value === null ? null : resolveRdfIri(value, baseIri);
}

function getDirectChild(parent: Element, localName: string): Element | null {
  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children[i];
    const childLocal = child.localName || child.tagName.split(':').pop();
    if (
      childLocal === localName
      && !isInsideXmlLiteralProperty(child, parent)
    ) return child;
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
  baseIri: string | undefined,
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
    pathUri = resolveRdfIri(pathUri, baseIri);

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
export function parseRDF(
  rdfXml: string,
  options: RdfParseOptions = {},
): RdfParseResult {
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
  const xmlBase = root.getAttributeNS(XML_NS, 'base') || undefined;
  const effectiveBaseIri = xmlBase
    ? resolveProjectionIri(xmlBase, options.baseIri).value
    : options.baseIri;
  const projection: RdfProjectionMap = {
    entities: {},
    relationships: {},
  };
  const rdfNodeIndex = indexRdfNodes(root);
  const descriptionTypeIndex = rdfNodeIndex.descriptionsByType;
  const shaclPathMetadata = parseShaclPathMetadata(
    root,
    descriptionTypeIndex,
    rdfNodeIndex.nodesById,
    effectiveBaseIri,
  );

  // --- Extract ontology metadata ---
  let ontologyName = '';
  let ontologyDescription = '';
  let rdfMetadata: OntologyRdfMetadata | undefined;
  const hasShaclSource =
    getElementsIncludingRoot(root, SHACL_NS, '*').length > 0;

  const ontologyEls = getTypedElements(root, OWL_NS, 'Ontology', descriptionTypeIndex);
  if (ontologyEls.length > 0) {
    const ontEl = ontologyEls[0];
    const ontologyIdentity = getProjectionNodeIdentity(
      ontEl,
      effectiveBaseIri,
    );
    if (
      ontologyIdentity?.term
      && !hasNestedXmlBase(ontEl, root)
    ) {
      projection.ontology = {
        term: ontologyIdentity.term,
      };
    }
    ontologyName = getChildText(ontEl, 'label', RDFS_NS) || '';
    ontologyDescription = getChildText(ontEl, 'comment', RDFS_NS) || '';
    const generatedSubset = getDirectChildText(
      ontEl,
      'generatedSubset',
      PLAYGROUND_METADATA_NS,
    )?.trim() === 'true';
    const imports = Array.from(new Set([
      ...getChildResources(ontEl, 'imports', OWL_NS),
      ...getChildResources(
        ontEl,
        'sourceImport',
        PLAYGROUND_METADATA_NS,
      ),
    ]));
    const preservedSourceFeatures: OntologyRdfMetadata['preservedSourceFeatures'] = [];
    if (imports.length > 0) preservedSourceFeatures.push('owlImports');
    if (hasShaclSource) {
      preservedSourceFeatures.push('shacl');
    }
    rdfMetadata = {
      ontologyIri: (
        generatedSubset
          ? getChildResource(ontEl, 'source', DCTERMS_NS)
          : null
      ) || projection.ontology?.term.value || undefined,
      versionIri: (
        getChildResource(
          ontEl,
          'sourceVersionIri',
          PLAYGROUND_METADATA_NS,
        )
        || getChildResource(ontEl, 'versionIRI', OWL_NS)
        || undefined
      ),
      versionInfo: (
        getDirectChildText(
          ontEl,
          'sourceVersionInfo',
          PLAYGROUND_METADATA_NS,
        )
        || getDirectChildText(ontEl, 'versionInfo', OWL_NS)
        || undefined
      ),
      license: (
        getChildResource(ontEl, 'license', DCTERMS_NS)
        || getDirectChildText(ontEl, 'license', DCTERMS_NS)
        || undefined
      ),
      imports,
      preservedSourceFeatures,
    };
  } else if (hasShaclSource) {
    rdfMetadata = {
      imports: [],
      preservedSourceFeatures: ['shacl'],
    };
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
      .map((element) =>
        getProjectionNodeIdentity(element, effectiveBaseIri))
      .filter((identity): identity is ProjectionNodeIdentity =>
        identity !== null)
      .map(projectionIdentityKey)
      .filter((uri): uri is string => uri !== undefined),
  );
  const entityMap = new Map<string, EntityType>();
  const usedEntityIds = new Set<string>();
  const associationRelationshipByClass = new Map<string, string>();
  const identifierPropertiesByClass = new Map<string, Set<string>>();

  for (const el of classEls) {
    const identity = getProjectionNodeIdentity(el, effectiveBaseIri);
    if (!identity) continue;
    const about = projectionIdentityKey(identity);

    const isStatementAssociation = getChildResources(el, 'subClassOf')
      .includes(`${RDF_NS}Statement`);
    const relatedRelationship = getChildResource(el, 'relation');
    const relatedRelationshipKey = resolveProjectionReference(
      relatedRelationship,
      effectiveBaseIri,
    );
    if (
      isStatementAssociation
      && relatedRelationshipKey
      && objectPropertyUris.has(relatedRelationshipKey)
    ) {
      associationRelationshipByClass.set(
        about,
        localNameFromUri(relatedRelationshipKey),
      );
    }

    const identifierProperties = getCollectionResources(
      el,
      'hasKey',
      rdfNodeIndex.nodesById,
    );
    if (identifierProperties.length > 0) {
      identifierPropertiesByClass.set(
        about,
        new Set(identifierProperties.map((resource) =>
          resolveRdfIri(resource, effectiveBaseIri))),
      );
    }
  }

  for (let i = 0; i < classEls.length; i++) {
    const el = classEls[i];
    const identity = getProjectionNodeIdentity(el, effectiveBaseIri);
    if (
      !identity
      || associationRelationshipByClass.has(projectionIdentityKey(identity))
    ) {
      continue;
    }
    const about = projectionIdentityKey(identity);

    const className = localNameFromUri(identity.reference);
    const existingEntity = entityMap.get(about);
    const entityId = existingEntity?.id
      ?? createUniqueId(uncapitalize(className) || 'entity', usedEntityIds);
    const label = getChildText(el, 'label', RDFS_NS)
      || existingEntity?.name
      || className;
    const description = getChildText(el, 'comment', RDFS_NS)
      || existingEntity?.description
      || '';
    const icon = getChildText(el, 'icon') || existingEntity?.icon || '📦';
    const color = getChildText(el, 'color')
      || existingEntity?.color
      || '#0078D4';

    entityMap.set(about, {
      id: entityId,
      name: label,
      description,
      icon,
      color,
      properties: [],
    });
    if (identity.term && !hasNestedXmlBase(el, root)) {
      projection.entities[entityId] = {
        term: identity.term,
      };
    }
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
    const identity = getProjectionNodeIdentity(el, effectiveBaseIri);
    if (!identity) continue;
    const about = projectionIdentityKey(identity);

    const comments = getChildTexts(el, 'comment');
    const hasIdentifierComment = comments.some(c => /^identifier\s+property$/i.test(c.trim()));
    const descriptionComment = comments.find(c => !/^identifier\s+property$/i.test(c.trim())) ?? null;
    const domainUri = resolveProjectionReference(
      getChildResource(el, 'domain', RDFS_NS),
      effectiveBaseIri,
    );
    const legacyEnumValues = getChildText(el, 'enumValues');
    const shapeMetadata = shaclPathMetadata.get(about);

    parsedDtProps.push({
      about,
      label: getChildText(el, 'label', RDFS_NS) || localNameFromUri(about),
      domainUri,
      rangeUri: resolveProjectionReference(
        getChildResource(el, 'range', RDFS_NS),
        effectiveBaseIri,
      ),
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
    const identity = getProjectionNodeIdentity(el, effectiveBaseIri);
    if (!identity) continue;
    const about = projectionIdentityKey(identity);

    const sourceRelId = localNameFromUri(about) || 'relationship';
    const relId = createUniqueId(sourceRelId, usedRelationshipIds);
    const label = getChildText(el, 'label', RDFS_NS) || sourceRelId;
    const description = getChildText(el, 'comment', RDFS_NS) || undefined;

    // Get from/to entity IDs — prefer explicit ont:fromEntityId/toEntityId,
    // fallback to domain/range URI.  Always uncapitalize to match entity IDs.
    let fromId = uncapitalize(getChildText(el, 'fromEntityId') || '');
    let toId = uncapitalize(getChildText(el, 'toEntityId') || '');

    if (!fromId) {
      const domainUri = resolveProjectionReference(
        getChildResource(el, 'domain', RDFS_NS),
        effectiveBaseIri,
      );
      if (domainUri) {
        fromId = entityMap.get(domainUri)?.id
          ?? uncapitalize(localNameFromUri(domainUri));
      }
    }
    if (!toId) {
      const rangeUri = resolveProjectionReference(
        getChildResource(el, 'range', RDFS_NS),
        effectiveBaseIri,
      );
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
    if (identity.term && !hasNestedXmlBase(el, root)) {
      projection.relationships[rel.id] = {
        kind: 'association',
        term: identity.term,
      };
    }
  }

  // --- Extract rdfs:subClassOf hierarchy → Relationships (#101) ---
  // Many published ontologies (e.g. Brick) carry little or no
  // rdfs:domain/rdfs:range on their object properties; their dominant graph
  // structure is the class taxonomy. Surface it as relationships so imported
  // hierarchies are visible instead of rendering as disconnected nodes.
  const seenSubClassEdges = new Set<string>();

  for (let i = 0; i < classEls.length; i++) {
    const el = classEls[i];
    const identity = getProjectionNodeIdentity(el, effectiveBaseIri);
    if (!identity) continue;
    const about = projectionIdentityKey(identity);

    const subEntity = entityMap.get(about);
    if (!subEntity) continue;

    const superUris = getChildResources(el, 'subClassOf', RDFS_NS);
    for (const rawSuperUri of superUris) {
      if (childResourceHasXmlBase(
        el,
        'subClassOf',
        RDFS_NS,
        rawSuperUri,
      )) {
        continue;
      }
      const superUri = resolveRdfIri(rawSuperUri, effectiveBaseIri);
      // Only link classes that were imported as entities; skip external
      // references (owl:Thing, other vocabularies) and self-references.
      const superEntity = entityMap.get(superUri);
      if (!superEntity || superEntity === subEntity) continue;

      const edgeKey = `${subEntity.id}\u0000${superEntity.id}`;
      if (seenSubClassEdges.has(edgeKey)) continue;
      seenSubClassEdges.add(edgeKey);

      const relationshipId = createUniqueId(
          `${subEntity.id}-subClassOf-${superEntity.id}`,
          usedRelationshipIds,
        );
      relationships.push({
        id: relationshipId,
        name: 'subClassOf',
        from: subEntity.id,
        to: superEntity.id,
        cardinality: 'many-to-one',
        kind: 'subclass',
      });
      if (
        !hasNestedXmlBase(el, root)
      ) {
        projection.relationships[relationshipId] = {
          kind: 'subclass',
          subject: resolveProjectionIri(about, effectiveBaseIri),
          object: resolveProjectionIri(superUri, effectiveBaseIri),
        };
      }
    }
  }

  // --- Extract DataBindings ---
  const bindings: DataBinding[] = [];
  // DataBinding uses the ontology's own namespace, so match by local name.
  const dataBindingElements = getElementsIncludingRoot(
    root,
    '*',
    'DataBinding',
  );
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

  if (
    !options.allowEmptyProjection
    && !ontologyName
    && entityTypes.length === 0
  ) {
    throw new RDFParseError('No ontology metadata or OWL classes found in the RDF document.');
  }

  const ontology: Ontology = {
    name: ontologyName || 'Imported Ontology',
    description: ontologyDescription,
    entityTypes,
    relationships,
  };
  if (rdfMetadata) ontology.rdfMetadata = rdfMetadata;

  return { ontology, bindings, projection };
}
