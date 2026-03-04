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
        child.getAttributeNS(RDF_NS, 'resource')
      );
    }
  }
  return null;
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

/**
 * Extract a description from an element, trying multiple annotation vocabularies
 * in order of preference: rdfs:comment, skos:definition, dcterms:abstract,
 * cmns-av:explanatoryNote.
 */
function extractDescription(el: Element): string {
  return (
    getChildText(el, 'comment', RDFS_NS) ||
    getChildText(el, 'definition', SKOS_NS) ||
    getChildText(el, 'abstract', DCTERMS_NS) ||
    getChildText(el, 'explanatoryNote') ||
    ''
  );
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
const SKOS_NS = 'http://www.w3.org/2004/02/skos/core#';
const DCTERMS_NS = 'http://purl.org/dc/terms/';

interface ParsedDatatypeProperty {
  about: string;
  label: string;
  domainUri: string | null;
  rangeUri: string | null;
  comment: string | null;
  isIdentifier: boolean;
  unit: string | null;
  enumValues: string | null;
  propertyType: string | null;
  relationshipAttributeOf: string | null;
  attributeType: string | null;
}

/**
 * Create a stub (external) entity for a URI that is referenced but not
 * defined in the current document.
 */
function createExternalEntity(uri: string): EntityType {
  const className = localNameFromUri(uri);
  return {
    id: uncapitalize(className),
    name: className,
    description: `External class from ${uri}`,
    icon: '🔗',
    color: '#888888',
    properties: [],
    isExternal: true,
  };
}

/**
 * Ensure an entity exists for a given URI in the entity map. If the URI is
 * not already present, a stub external entity is created and added.
 * Returns the entity ID.
 */
function ensureEntity(uri: string, entityMap: Map<string, EntityType>): string {
  if (!entityMap.has(uri)) {
    const stub = createExternalEntity(uri);
    entityMap.set(uri, stub);
  }
  return entityMap.get(uri)!.id;
}

/**
 * Parse an RDF/XML (OWL) string into an Ontology and optional DataBindings.
 */
export function parseRDF(rdfXml: string): { ontology: Ontology; bindings: DataBinding[] } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(rdfXml, 'application/xml');

  // Check for XML parse errors
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new RDFParseError(`Malformed XML: ${parseError.textContent?.trim() || 'parse error'}`);
  }

  const root = doc.documentElement;

  // --- Extract ontology metadata ---
  let ontologyName = '';
  let ontologyDescription = '';
  const imports: string[] = [];

  const ontologyEls = root.getElementsByTagNameNS(OWL_NS, 'Ontology');
  if (ontologyEls.length > 0) {
    const ontEl = ontologyEls[0];
    ontologyName = getChildText(ontEl, 'label', RDFS_NS) || '';
    ontologyDescription = extractDescription(ontEl);

    // Extract owl:imports
    for (let i = 0; i < ontEl.children.length; i++) {
      const child = ontEl.children[i];
      const childLocal = child.localName || child.tagName.split(':').pop();
      if (childLocal === 'imports') {
        const importUri =
          child.getAttribute('rdf:resource') ||
          child.getAttributeNS(RDF_NS, 'resource');
        if (importUri) imports.push(importUri);
      }
    }
  }

  // --- Extract OWL Classes → EntityTypes ---
  const classEls = root.getElementsByTagNameNS(OWL_NS, 'Class');
  const entityMap = new Map<string, EntityType>();

  for (let i = 0; i < classEls.length; i++) {
    const el = classEls[i];
    const about = el.getAttribute('rdf:about') || el.getAttributeNS(RDF_NS, 'about') || '';
    if (!about) continue;

    const className = localNameFromUri(about);
    const entityId = uncapitalize(className);
    const label = getChildText(el, 'label', RDFS_NS) || className;
    const description = extractDescription(el);
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

  // --- Extract rdfs:subClassOf as inheritance relationships ---
  // --- Extract owl:Restriction blocks as relationships ---
  const relationships: Relationship[] = [];
  const seenRelIds = new Set<string>();

  /** Generate a unique relationship ID, appending a suffix if needed. */
  function uniqueRelId(base: string): string {
    let id = base;
    let counter = 2;
    while (seenRelIds.has(id)) {
      id = `${base}_${counter++}`;
    }
    seenRelIds.add(id);
    return id;
  }

  for (let i = 0; i < classEls.length; i++) {
    const el = classEls[i];
    const about = el.getAttribute('rdf:about') || el.getAttributeNS(RDF_NS, 'about') || '';
    if (!about) continue;

    const fromId = uncapitalize(localNameFromUri(about));

    for (let j = 0; j < el.children.length; j++) {
      const child = el.children[j];
      const childLocal = child.localName || child.tagName.split(':').pop();
      if (childLocal !== 'subClassOf') continue;

      // Case 1: Direct URI reference — rdfs:subClassOf rdf:resource="..."
      const parentUri =
        child.getAttribute('rdf:resource') ||
        child.getAttributeNS(RDF_NS, 'resource');
      if (parentUri) {
        const toId = ensureEntity(parentUri, entityMap);
        const relId = uniqueRelId(`${fromId}_inherits_${toId}`);
        relationships.push({
          id: relId,
          name: 'inherits',
          from: fromId,
          to: toId,
          cardinality: 'one-to-one',
        });
        continue;
      }

      // Case 2: Anonymous restriction — rdfs:subClassOf > owl:Restriction
      const restrictionEls = child.getElementsByTagNameNS(OWL_NS, 'Restriction');
      if (restrictionEls.length === 0) continue;

      const restriction = restrictionEls[0];
      const onPropertyUri = getChildResource(restriction, 'onProperty');
      if (!onPropertyUri) continue;

      // Find the target class from someValuesFrom or allValuesFrom
      const targetUri =
        getChildResource(restriction, 'someValuesFrom') ||
        getChildResource(restriction, 'allValuesFrom') ||
        getChildResource(restriction, 'onClass');
      if (!targetUri) continue;

      const toId = ensureEntity(targetUri, entityMap);
      const propName = localNameFromUri(onPropertyUri);
      const relId = uniqueRelId(`${fromId}_${propName}_${toId}`);

      relationships.push({
        id: relId,
        name: propName,
        from: fromId,
        to: toId,
        cardinality: 'one-to-many',
      });
    }
  }

  // --- Extract DatatypeProperties → Properties + Relationship Attributes ---
  const dtPropEls = root.getElementsByTagNameNS(OWL_NS, 'DatatypeProperty');
  const parsedDtProps: ParsedDatatypeProperty[] = [];

  for (let i = 0; i < dtPropEls.length; i++) {
    const el = dtPropEls[i];
    const about = el.getAttribute('rdf:about') || el.getAttributeNS(RDF_NS, 'about') || '';
    if (!about) continue;

    const comments = getChildTexts(el, 'comment');
    const hasIdentifierComment = comments.some(c => /^identifier\s+property$/i.test(c.trim()));
    const descriptionComment = comments.find(c => !/^identifier\s+property$/i.test(c.trim())) ?? null;

    // Also try skos:definition for DatatypeProperty descriptions
    const description = descriptionComment ||
      getChildText(el, 'definition', SKOS_NS) ||
      null;

    parsedDtProps.push({
      about,
      label: getChildText(el, 'label', RDFS_NS) || localNameFromUri(about),
      domainUri: getChildResource(el, 'domain'),
      rangeUri: getChildResource(el, 'range'),
      comment: description,
      isIdentifier: getChildText(el, 'isIdentifier') === 'true' || hasIdentifierComment,
      unit: getChildText(el, 'unit'),
      enumValues: getChildText(el, 'enumValues'),
      propertyType: getChildText(el, 'propertyType'),
      relationshipAttributeOf: getChildText(el, 'relationshipAttributeOf'),
      attributeType: getChildText(el, 'attributeType'),
    });
  }

  // Collect relationship attributes separately
  const relAttrMap = new Map<string, RelationshipAttribute[]>();

  for (const dtProp of parsedDtProps) {
    if (dtProp.relationshipAttributeOf) {
      const relId = dtProp.relationshipAttributeOf;
      if (!relAttrMap.has(relId)) {
        relAttrMap.set(relId, []);
      }
      relAttrMap.get(relId)!.push({
        name: dtProp.label,
        type: dtProp.attributeType || 'string',
      });
      continue;
    }

    // Regular entity property — match to entity by domain URI
    if (!dtProp.domainUri) continue;

    const entity = entityMap.get(dtProp.domainUri);
    if (!entity) continue;

    // Determine property type
    let propType: PropertyType = 'string';
    if (dtProp.propertyType && isValidPropertyType(dtProp.propertyType)) {
      propType = dtProp.propertyType;
    } else if (dtProp.rangeUri) {
      const xsdLocal = localNameFromUri(dtProp.rangeUri);
      if (XSD_TO_TYPE[xsdLocal]) {
        propType = XSD_TO_TYPE[xsdLocal];
      }
    }

    const prop: Property = {
      name: dtProp.label,
      type: propType,
    };

    if (dtProp.isIdentifier) prop.isIdentifier = true;
    if (dtProp.unit) prop.unit = dtProp.unit;
    if (dtProp.enumValues) {
      prop.values = dtProp.enumValues.split(',');
    }
    if (dtProp.comment) prop.description = dtProp.comment;

    entity.properties.push(prop);
  }

  // --- Extract ObjectProperties → Relationships ---
  const objPropEls = root.getElementsByTagNameNS(OWL_NS, 'ObjectProperty');

  for (let i = 0; i < objPropEls.length; i++) {
    const el = objPropEls[i];
    const about = el.getAttribute('rdf:about') || el.getAttributeNS(RDF_NS, 'about') || '';
    if (!about) continue;

    const baseRelId = localNameFromUri(about);
    const label = getChildText(el, 'label', RDFS_NS) || baseRelId;
    const description = getChildText(el, 'comment', RDFS_NS) ||
      getChildText(el, 'definition', SKOS_NS) || undefined;

    // Get from/to entity IDs — prefer explicit ont:fromEntityId/toEntityId,
    // fallback to domain/range URI.  Always uncapitalize to match entity IDs.
    let fromId = uncapitalize(getChildText(el, 'fromEntityId') || '');
    let toId = uncapitalize(getChildText(el, 'toEntityId') || '');

    if (!fromId) {
      const domainUri = getChildResource(el, 'domain');
      if (domainUri) fromId = uncapitalize(localNameFromUri(domainUri));
    }
    if (!toId) {
      const rangeUri = getChildResource(el, 'range');
      if (rangeUri) toId = uncapitalize(localNameFromUri(rangeUri));
    }

    // Skip object properties without resolvable endpoints
    if (!fromId && !toId) continue;

    const cardinalityStr = getChildText(el, 'cardinality') || 'one-to-many';
    const cardinality: Cardinality = isValidCardinality(cardinalityStr)
      ? cardinalityStr
      : 'one-to-many';

    const relId = uniqueRelId(baseRelId);
    const rel: Relationship = {
      id: relId,
      name: label,
      from: fromId,
      to: toId,
      cardinality,
    };

    if (description) rel.description = description;

    // Attach relationship attributes
    const attrs = relAttrMap.get(baseRelId);
    if (attrs && attrs.length > 0) {
      rel.attributes = attrs;
    }

    relationships.push(rel);
  }

  // --- Extract DataBindings ---
  const bindings: DataBinding[] = [];
  // Look for ont:DataBinding elements (they use the ontology namespace)
  const allElements = root.getElementsByTagName('*');
  for (let i = 0; i < allElements.length; i++) {
    const el = allElements[i];
    const localName = el.localName || el.tagName.split(':').pop();
    if (localName !== 'DataBinding') continue;

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

  // Safety: filter out relationships with unresolved from/to
  const entityIds = new Set(entityTypes.map(e => e.id));
  const validRelationships = relationships.filter(
    r => r.from && r.to && entityIds.has(r.from) && entityIds.has(r.to),
  );

  if (!ontologyName && entityTypes.length === 0) {
    throw new RDFParseError('No ontology metadata or OWL classes found in the RDF document.');
  }

  const ontology: Ontology = {
    name: ontologyName || 'Imported Ontology',
    description: ontologyDescription,
    entityTypes,
    relationships: validRelationships,
  };

  if (imports.length > 0) {
    ontology.imports = imports;
  }

  return { ontology, bindings };
}
