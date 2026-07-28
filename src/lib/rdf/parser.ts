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

/** The BCP-47 language tag on an element, lowercased. '' when untagged. */
function langOf(el: Element): string {
  return (
    el.getAttribute('xml:lang') ||
    el.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'lang') ||
    ''
  ).toLowerCase();
}

/** Direct children of `parent` whose local name matches. */
function getChildElements(parent: Element, localName: string): Element[] {
  const matches: Element[] = [];
  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children[i];
    const childLocal = child.localName || child.tagName.split(':').pop();
    if (childLocal === localName) matches.push(child);
  }
  return matches;
}

/**
 * Pick the best element for a language.
 *
 * Preference order: exact tag ("ko") → primary subtag ("ko-KR" matches "ko")
 * → untagged → first one found.  This lets a single RDF file carry both
 * `<rdfs:label xml:lang="en">Participant</rdfs:label>` and
 * `<rdfs:label xml:lang="ko">참여자</rdfs:label>`.
 */
function pickByLang(elements: Element[], preferredLang: string): Element | null {
  if (elements.length === 0) return null;
  if (elements.length === 1) return elements[0];

  const want = preferredLang.toLowerCase();
  const primary = want.split('-')[0];

  const exact = elements.find((el) => langOf(el) === want);
  if (exact) return exact;

  if (primary) {
    const byPrimary = elements.find((el) => langOf(el).split('-')[0] === primary);
    if (byPrimary) return byPrimary;
  }

  const untagged = elements.find((el) => langOf(el) === '');
  if (untagged) return untagged;

  return elements[0];
}

/** Like getChildText, but honouring xml:lang when the element is repeated. */
function getChildTextLang(
  parent: Element,
  localName: string,
  preferredLang: string,
  namespace?: string,
): string | null {
  const matches = getChildElements(parent, localName);
  if (matches.length === 0) {
    // Nothing at this level — fall back to the namespace-aware descendant search.
    return getChildText(parent, localName, namespace);
  }
  return pickByLang(matches, preferredLang)?.textContent ?? null;
}

/**
 * Collect the property URIs named by an `owl:hasKey` collection on a class:
 *
 *   <owl:Class rdf:about="#Participant">
 *     <owl:hasKey rdf:parseType="Collection">
 *       <owl:DatatypeProperty rdf:about="#participantId"/>
 *     </owl:hasKey>
 *   </owl:Class>
 *
 * This is the standard OWL way to declare a key, and what tools like Protégé
 * emit — the ont:isIdentifier annotation below is this app's own shorthand.
 */
function getHasKeyPropertyUris(classEl: Element): string[] {
  const uris: string[] = [];
  for (let i = 0; i < classEl.children.length; i++) {
    const child = classEl.children[i];
    const childLocal = child.localName || child.tagName.split(':').pop();
    if (childLocal !== 'hasKey') continue;

    const members = child.getElementsByTagName('*');
    for (let j = 0; j < members.length; j++) {
      const uri =
        members[j].getAttribute('rdf:about') ||
        members[j].getAttributeNS(RDF_NS, 'about');
      if (uri) uris.push(uri);
    }
  }
  return uris;
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

export interface ParseRDFOptions {
  /**
   * Language to prefer when labels/comments are repeated with xml:lang tags.
   * Defaults to '' — take them in document order, as before.
   */
  preferredLang?: string;
}

/**
 * Parse an RDF/XML (OWL) string into an Ontology and optional DataBindings.
 */
export function parseRDF(
  rdfXml: string,
  options: ParseRDFOptions = {},
): { ontology: Ontology; bindings: DataBinding[] } {
  const preferredLang = options.preferredLang ?? '';
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

  const ontologyEls = root.getElementsByTagNameNS(OWL_NS, 'Ontology');
  if (ontologyEls.length > 0) {
    const ontEl = ontologyEls[0];
    ontologyName = getChildTextLang(ontEl, 'label', preferredLang, RDFS_NS) || '';
    ontologyDescription = getChildTextLang(ontEl, 'comment', preferredLang, RDFS_NS) || '';
  }

  // --- Extract OWL Classes → EntityTypes ---
  const classEls = root.getElementsByTagNameNS(OWL_NS, 'Class');
  const entityMap = new Map<string, EntityType>();
  // Property URIs declared as keys via owl:hasKey, across all classes.
  const hasKeyPropertyUris = new Set<string>();

  for (let i = 0; i < classEls.length; i++) {
    const el = classEls[i];
    const about = el.getAttribute('rdf:about') || el.getAttributeNS(RDF_NS, 'about') || '';
    if (!about) continue;

    const className = localNameFromUri(about);
    const entityId = uncapitalize(className);
    const label = getChildTextLang(el, 'label', preferredLang, RDFS_NS) || className;
    const description = getChildTextLang(el, 'comment', preferredLang, RDFS_NS) || '';
    const icon = getChildText(el, 'icon') || '📦';
    const color = getChildText(el, 'color') || '#0078D4';

    for (const keyUri of getHasKeyPropertyUris(el)) {
      hasKeyPropertyUris.add(keyUri);
    }

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
  const dtPropEls = root.getElementsByTagNameNS(OWL_NS, 'DatatypeProperty');
  const parsedDtProps: ParsedDatatypeProperty[] = [];

  for (let i = 0; i < dtPropEls.length; i++) {
    const el = dtPropEls[i];
    const about = el.getAttribute('rdf:about') || el.getAttributeNS(RDF_NS, 'about') || '';
    if (!about) continue;

    // "identifier property" is a marker comment, not a description — filter it
    // out before picking the description for the requested language.
    const isIdentifierMarker = (text: string) => /^identifier\s+property$/i.test(text.trim());
    const commentEls = getChildElements(el, 'comment');
    const hasIdentifierComment = commentEls.some((c) => isIdentifierMarker(c.textContent ?? ''));
    const descriptionComment =
      pickByLang(
        commentEls.filter((c) => !isIdentifierMarker(c.textContent ?? '')),
        preferredLang,
      )?.textContent ?? null;

    parsedDtProps.push({
      about,
      label: getChildTextLang(el, 'label', preferredLang, RDFS_NS) || localNameFromUri(about),
      domainUri: getChildResource(el, 'domain'),
      rangeUri: getChildResource(el, 'range'),
      comment: descriptionComment,
      isIdentifier:
        getChildText(el, 'isIdentifier') === 'true' ||
        hasIdentifierComment ||
        hasKeyPropertyUris.has(about),
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
  const relationships: Relationship[] = [];

  for (let i = 0; i < objPropEls.length; i++) {
    const el = objPropEls[i];
    const about = el.getAttribute('rdf:about') || el.getAttributeNS(RDF_NS, 'about') || '';
    if (!about) continue;

    const relId = localNameFromUri(about);
    const label = getChildTextLang(el, 'label', preferredLang, RDFS_NS) || relId;
    const description = getChildTextLang(el, 'comment', preferredLang, RDFS_NS) || undefined;

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

    const cardinalityStr = getChildText(el, 'cardinality') || 'one-to-many';
    const cardinality: Cardinality = isValidCardinality(cardinalityStr)
      ? cardinalityStr
      : 'one-to-many';

    const rel: Relationship = {
      id: relId,
      name: label,
      from: fromId,
      to: toId,
      cardinality,
    };

    if (description) rel.description = description;

    // Attach relationship attributes
    const attrs = relAttrMap.get(relId);
    if (attrs && attrs.length > 0) {
      rel.attributes = attrs;
    }

    // Skip relationships with unresolved source or target
    if (!rel.from || !rel.to) continue;

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
