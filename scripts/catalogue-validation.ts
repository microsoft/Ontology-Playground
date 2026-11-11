import type { Ontology } from '../src/data/ontology';
import { assertSupportedRdfXmlSource } from '../src/lib/rdf/dataset';
import { validateOntology } from '../src/store/designerStore';

export const CATALOGUE_TIERS = [
  'official',
  'community',
  'external',
] as const;

export type CatalogueTier = (typeof CATALOGUE_TIERS)[number];
export type ValidationProfile = 'authored' | 'external';

export interface CatalogueMetadata {
  name: string;
  description: string;
  category: string;
  icon?: string;
  tags?: string[];
  author?: string;
  license?: string;
  sourceUrl?: string;
  version?: string;
}

export interface ValidationIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
}

export interface ValidationReport {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface RdfSourceValidationReport extends ValidationReport {
  text?: string;
}

export interface ValidationLimits {
  maxSourceBytes: number;
  maxEntities: number;
  maxRelationships: number;
  maxProperties: number;
  maxImports: number;
}

export const DEFAULT_VALIDATION_LIMITS: ValidationLimits = {
  maxSourceBytes: 8 * 1024 * 1024,
  maxEntities: 5_000,
  maxRelationships: 20_000,
  maxProperties: 50_000,
  maxImports: 1_000,
};

const FABRIC_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;
const RDF_NS = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS_NS = 'http://www.w3.org/2000/01/rdf-schema#';
const OWL_NS = 'http://www.w3.org/2002/07/owl#';
const VALID_CATEGORIES = new Set([
  'retail',
  'healthcare',
  'finance',
  'manufacturing',
  'education',
  'food',
  'media',
  'events',
  'technology',
  'general',
  'iq-lab',
  'school',
  'fibo',
]);

const SOURCE_ONLY_TERMS = [
  {
    label: 'OWL restrictions',
    terms: ['Restriction'],
  },
  {
    label: 'OWL set expressions',
    terms: ['unionOf', 'intersectionOf', 'complementOf', 'oneOf'],
  },
  {
    label: 'OWL property chains',
    terms: ['propertyChainAxiom'],
  },
  {
    label: 'OWL keys',
    terms: ['hasKey'],
  },
  {
    label: 'OWL disjointness axioms',
    terms: [
      'disjointWith',
      'AllDisjointClasses',
      'AllDisjointProperties',
    ],
  },
] as const;

function issue(
  severity: ValidationIssue['severity'],
  code: string,
  message: string,
): ValidationIssue {
  return { severity, code, message };
}

function emptyReport(): ValidationReport {
  return { errors: [], warnings: [] };
}

function appendIssue(
  report: ValidationReport,
  candidate: ValidationIssue,
): void {
  report[candidate.severity === 'error' ? 'errors' : 'warnings'].push(candidate);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasSafeText(value: string): boolean {
  return value === value.trim()
    && value.length > 0
    && !Array.from(value).some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || codePoint === 127;
    });
}

function isSafeHttpsUrl(value: string): boolean {
  if (!hasSafeText(value) || /\s/.test(value)) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && Boolean(url.hostname)
      && url.username === ''
      && url.password === '';
  } catch {
    return false;
  }
}

function profileForTier(tier: CatalogueTier): ValidationProfile {
  return tier === 'external' ? 'external' : 'authored';
}

export function validateCatalogueMetadata(
  metadata: unknown,
  tier: CatalogueTier,
): ValidationReport {
  const report = emptyReport();
  if (!isRecord(metadata)) {
    report.errors.push(issue(
      'error',
      'metadata-object',
      'Metadata must be a JSON object.',
    ));
    return report;
  }

  for (const field of ['name', 'description', 'category'] as const) {
    const value = metadata[field];
    if (typeof value !== 'string' || !hasSafeText(value)) {
      report.errors.push(issue(
        'error',
        `metadata-${field}`,
        `Metadata field "${field}" must be a non-empty string without control characters.`,
      ));
    }
  }

  if (
    typeof metadata.category === 'string'
    && hasSafeText(metadata.category)
    && !VALID_CATEGORIES.has(metadata.category)
  ) {
    report.errors.push(issue(
      'error',
      'metadata-category',
      `Metadata field "category" must be one of: ${Array.from(VALID_CATEGORIES).join(', ')}.`,
    ));
  }

  for (const field of [
    'icon',
    'author',
    'license',
    'sourceUrl',
    'version',
  ] as const) {
    const value = metadata[field];
    if (
      value !== undefined
      && (typeof value !== 'string' || !hasSafeText(value))
    ) {
      report.errors.push(issue(
        'error',
        `metadata-${field}`,
        `Metadata field "${field}" must be a non-empty string without control characters when provided.`,
      ));
    }
  }

  if (metadata.tags !== undefined) {
    if (
      !Array.isArray(metadata.tags)
      || metadata.tags.some(
        (tag) => typeof tag !== 'string' || !hasSafeText(tag),
      )
    ) {
      report.errors.push(issue(
        'error',
        'metadata-tags',
        'Metadata field "tags" must be an array of non-empty strings without control characters.',
      ));
    }
  }

  if (tier === 'external') {
    for (const field of ['license', 'sourceUrl'] as const) {
      const value = metadata[field];
      if (typeof value !== 'string' || !hasSafeText(value)) {
        report.errors.push(issue(
          'error',
          'external-provenance',
          `External metadata requires "${field}".`,
        ));
      }
    }

  }

  if (
    typeof metadata.sourceUrl === 'string'
    && !isSafeHttpsUrl(metadata.sourceUrl)
  ) {
    report.errors.push(issue(
      'error',
      'metadata-source-url',
      'Metadata "sourceUrl" must be a safe HTTPS URL.',
    ));
  }

  return report;
}

function getRdfAttribute(
  element: Element,
  localName: string,
): string | null {
  return element.getAttributeNS(RDF_NS, localName);
}

type SourceTypeIndex = ReadonlyMap<string, readonly Element[]>;

function indexSourceTypes(document: Document): SourceTypeIndex {
  const elementsByType = new Map<string, Element[]>();
  const descriptions = document.getElementsByTagNameNS(
    RDF_NS,
    'Description',
  );

  for (let index = 0; index < descriptions.length; index++) {
    const description = descriptions[index];
    const indexedTypes = new Set<string>();
    for (
      let childIndex = 0;
      childIndex < description.children.length;
      childIndex++
    ) {
      const child = description.children[childIndex];
      const typeIri = getRdfAttribute(child, 'resource');
      if (
        child.namespaceURI === RDF_NS
        && child.localName === 'type'
        && typeIri
        && !indexedTypes.has(typeIri)
      ) {
        const elements = elementsByType.get(typeIri) ?? [];
        elements.push(description);
        elementsByType.set(typeIri, elements);
        indexedTypes.add(typeIri);
      }
    }
  }

  return elementsByType;
}

function getTypedSourceElements(
  document: Document,
  typeIndex: SourceTypeIndex,
  namespace: string,
  localName: string,
): Element[] {
  return [
    ...Array.from(document.getElementsByTagNameNS(namespace, localName)),
    ...(typeIndex.get(`${namespace}${localName}`) ?? []),
  ];
}

function getDirectChild(
  parent: Element,
  localName: string,
  namespace?: string,
): Element | undefined {
  return Array.from(parent.children).find(
    (child) => child.localName === localName
      && (namespace === undefined || child.namespaceURI === namespace),
  );
}

function getDirectChildText(
  parent: Element,
  localName: string,
): string {
  return getDirectChild(parent, localName)?.textContent?.trim() ?? '';
}

function getDirectChildResource(
  parent: Element,
  localName: string,
  namespace?: string,
): string {
  const child = getDirectChild(parent, localName, namespace);
  return child ? getRdfAttribute(child, 'resource') ?? '' : '';
}

function localNameFromIri(iri: string): string {
  const hashIndex = iri.lastIndexOf('#');
  if (hashIndex >= 0) return iri.slice(hashIndex + 1);
  const slashIndex = iri.lastIndexOf('/');
  if (slashIndex >= 0) return iri.slice(slashIndex + 1);
  return iri;
}

function normalizedGraphId(iri: string): string {
  const localName = localNameFromIri(iri);
  return localName
    ? `${localName.charAt(0).toLowerCase()}${localName.slice(1)}`
    : '';
}

function countOwlTerms(
  document: Document,
  typeIndex: SourceTypeIndex,
  terms: readonly string[],
): number {
  return terms.reduce((count, term) => {
    const isTypedNode = /^[A-Z]/.test(term);
    return count + (
      isTypedNode
        ? getTypedSourceElements(
            document,
            typeIndex,
            OWL_NS,
            term,
          ).length
        : document.getElementsByTagNameNS(OWL_NS, term).length
    );
  }, 0);
}

interface SourceGraphAnalysis extends ValidationReport {
  anonymousClasses: number;
  skippedObjectProperties: number;
}

function summarizeValues(values: readonly string[]): string {
  const examples = values.slice(0, 3).map((value) => `"${value}"`);
  return values.length > examples.length
    ? `${examples.join(', ')}, and ${values.length - examples.length} more`
    : examples.join(', ');
}

function analyzeSourceGraph(
  document: Document,
  typeIndex: SourceTypeIndex,
): SourceGraphAnalysis {
  const report: SourceGraphAnalysis = {
    errors: [],
    warnings: [],
    anonymousClasses: 0,
    skippedObjectProperties: 0,
  };
  const classElements = getTypedSourceElements(
    document,
    typeIndex,
    OWL_NS,
    'Class',
  );
  const objectPropertyElements = getTypedSourceElements(
    document,
    typeIndex,
    OWL_NS,
    'ObjectProperty',
  );
  const objectPropertyIris = new Set(
    objectPropertyElements
      .map((element) => getRdfAttribute(element, 'about'))
      .filter((iri): iri is string => Boolean(iri)),
  );
  const graphIdOwners = new Map<string, string>();
  const collisions: string[] = [];
  const classIris = new Set<string>();
  const missingClassIdentifiers: string[] = [];

  for (const element of classElements) {
    const iri = getRdfAttribute(element, 'about') ?? '';
    if (!iri) {
      report.anonymousClasses++;
      continue;
    }

    const superClass = getDirectChildResource(
      element,
      'subClassOf',
      RDFS_NS,
    );
    const relatedProperty = getDirectChildResource(element, 'relation');
    if (
      superClass === `${RDF_NS}Statement`
      && objectPropertyIris.has(relatedProperty)
    ) {
      continue;
    }

    classIris.add(iri);
    const graphId = normalizedGraphId(iri);
    if (!graphId) {
      missingClassIdentifiers.push(iri);
      continue;
    }

    const existing = graphIdOwners.get(graphId);
    if (existing && existing !== iri) {
      collisions.push(
        `${graphId}: ${existing} and ${iri}`,
      );
    } else {
      graphIdOwners.set(graphId, iri);
    }
  }

  const incompleteRelationships: string[] = [];
  const unresolvedRelationships: string[] = [];
  const duplicateRelationshipIris: string[] = [];
  const missingRelationshipIdentifiers: string[] = [];
  const renderedRelationshipIris = new Set<string>();

  for (const element of objectPropertyElements) {
    const iri = getRdfAttribute(element, 'about') ?? '';
    const explicitFromElement = getDirectChild(element, 'fromEntityId');
    const explicitToElement = getDirectChild(element, 'toEntityId');
    const explicitFrom = getDirectChildText(element, 'fromEntityId');
    const explicitTo = getDirectChildText(element, 'toEntityId');
    const domainIri = getDirectChildResource(
      element,
      'domain',
      RDFS_NS,
    );
    const rangeIri = getDirectChildResource(
      element,
      'range',
      RDFS_NS,
    );
    const hasSource = Boolean(explicitFrom || domainIri);
    const hasTarget = Boolean(explicitTo || rangeIri);

    if (!hasSource && !hasTarget) {
      report.skippedObjectProperties++;
      continue;
    }
    if (!hasSource || !hasTarget) {
      if (explicitFromElement || explicitToElement) {
        incompleteRelationships.push(iri || 'anonymous object property');
      } else {
        report.skippedObjectProperties++;
      }
      continue;
    }
    if (!iri) {
      missingRelationshipIdentifiers.push('anonymous object property');
      continue;
    }

    if (!explicitFrom && domainIri && !classIris.has(domainIri)) {
      unresolvedRelationships.push(`${iri} -> ${domainIri}`);
    }
    if (!explicitTo && rangeIri && !classIris.has(rangeIri)) {
      unresolvedRelationships.push(`${iri} -> ${rangeIri}`);
    }

    if (renderedRelationshipIris.has(iri)) {
      duplicateRelationshipIris.push(iri);
      continue;
    }
    renderedRelationshipIris.add(iri);

    const graphId = normalizedGraphId(iri);
    if (!graphId) {
      missingRelationshipIdentifiers.push(iri);
      continue;
    }
    const existing = graphIdOwners.get(graphId);
    if (existing && existing !== iri) {
      collisions.push(
        `${graphId}: ${existing} and ${iri}`,
      );
    } else {
      graphIdOwners.set(graphId, iri);
    }
  }

  if (missingClassIdentifiers.length > 0) {
    report.errors.push(issue(
      'error',
      'source-class-identifier',
      `${missingClassIdentifiers.length.toLocaleString()} OWL classes lack a stable source identifier (${summarizeValues(missingClassIdentifiers)}).`,
    ));
  }
  if (missingRelationshipIdentifiers.length > 0) {
    report.errors.push(issue(
      'error',
      'source-relationship-identifier',
      `${missingRelationshipIdentifiers.length.toLocaleString()} visual relationships lack a stable source identifier (${summarizeValues(missingRelationshipIdentifiers)}).`,
    ));
  }
  if (collisions.length > 0) {
    report.errors.push(issue(
      'error',
      'source-graph-id-collision',
      `${collisions.length.toLocaleString()} source identifier collisions would require order-dependent graph IDs (${summarizeValues(collisions)}).`,
    ));
  }
  if (incompleteRelationships.length > 0) {
    report.errors.push(issue(
      'error',
      'source-relationship-endpoints',
      `${incompleteRelationships.length.toLocaleString()} OWL object properties declare only one visual endpoint (${summarizeValues(incompleteRelationships)}).`,
    ));
  }
  if (unresolvedRelationships.length > 0) {
    report.errors.push(issue(
      'error',
      'source-relationship-target',
      `${unresolvedRelationships.length.toLocaleString()} OWL object property endpoints reference classes outside the visual graph (${summarizeValues(unresolvedRelationships)}).`,
    ));
  }
  if (duplicateRelationshipIris.length > 0) {
    report.errors.push(issue(
      'error',
      'source-relationship-duplicate',
      `${duplicateRelationshipIris.length.toLocaleString()} visual relationships are declared more than once (${summarizeValues(duplicateRelationshipIris)}).`,
    ));
  }

  return report;
}

export function validateRdfSource(
  sourceBytes: Uint8Array,
  limits: ValidationLimits = DEFAULT_VALIDATION_LIMITS,
): RdfSourceValidationReport {
  const report: RdfSourceValidationReport = emptyReport();

  if (sourceBytes.byteLength > limits.maxSourceBytes) {
    report.errors.push(issue(
      'error',
      'source-size-limit',
      `RDF source is ${sourceBytes.byteLength.toLocaleString()} bytes; the limit is ${limits.maxSourceBytes.toLocaleString()} bytes.`,
    ));
    return report;
  }

  let source: string;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(sourceBytes);
  } catch {
    report.errors.push(issue(
      'error',
      'source-utf8',
      'RDF source must be valid UTF-8.',
    ));
    return report;
  }
  report.text = source;

  if (!source.trimStart().startsWith('<')) {
    return report;
  }
  try {
    assertSupportedRdfXmlSource(source);
  } catch (error) {
    if (
      error instanceof Error
      && error.message.includes('DOCTYPE declarations are not accepted')
    ) {
      report.errors.push(issue(
        'error',
        'source-active-xml',
        'DOCTYPE declarations are not allowed in catalogue RDF.',
      ));
      return report;
    }
  }

  const document = new DOMParser().parseFromString(
    source,
    'application/xml',
  );
  const parseError = document.querySelector('parsererror');
  if (parseError) {
    report.errors.push(issue(
      'error',
      'source-xml',
      `Malformed XML: ${parseError.textContent?.trim() || 'parse error'}`,
    ));
    return report;
  }

  const importCount = document.getElementsByTagNameNS(
    OWL_NS,
    'imports',
  ).length;
  if (importCount > limits.maxImports) {
    report.errors.push(issue(
      'error',
      'resource-imports',
      `Ontology declares ${importCount.toLocaleString()} imports; the limit is ${limits.maxImports.toLocaleString()}.`,
    ));
  }

  const typeIndex = indexSourceTypes(document);
  const graphAnalysis = analyzeSourceGraph(document, typeIndex);
  report.errors.push(...graphAnalysis.errors);
  report.warnings.push(...graphAnalysis.warnings);

  const sourceOnlySemantics: { label: string; count: number }[] =
    SOURCE_ONLY_TERMS
    .map(({ label, terms }) => ({
      label,
      count: countOwlTerms(document, typeIndex, terms),
    }))
    .filter(({ count }) => count > 0);

  if (importCount > 0) {
    sourceOnlySemantics.push({
      label: 'OWL imports',
      count: importCount,
    });
  }
  if (graphAnalysis.skippedObjectProperties > 0) {
    sourceOnlySemantics.push({
      label: 'unmapped OWL object properties',
      count: graphAnalysis.skippedObjectProperties,
    });
  }
  if (graphAnalysis.anonymousClasses > 0) {
    sourceOnlySemantics.push({
      label: 'anonymous OWL class expressions',
      count: graphAnalysis.anonymousClasses,
    });
  }

  if (sourceOnlySemantics.length > 0) {
    report.warnings.push(issue(
      'warning',
      'source-only-semantics',
      `Source-only semantics are preserved in the original RDF but are not expanded in the visual model: ${sourceOnlySemantics.map(({ label, count }) => `${label} (${count.toLocaleString()})`).join(', ')}.`,
    ));
  }

  return report;
}

function validateResourceLimits(
  ontology: Ontology,
  limits: ValidationLimits,
): ValidationReport {
  const report = emptyReport();
  const propertyCount = ontology.entityTypes.reduce(
    (sum, entity) => sum + entity.properties.length,
    0,
  ) + ontology.relationships.reduce(
    (sum, relationship) => sum + (relationship.attributes?.length ?? 0),
    0,
  );
  const checks = [
    ['entities', ontology.entityTypes.length, limits.maxEntities],
    [
      'relationships',
      ontology.relationships.length,
      limits.maxRelationships,
    ],
    ['properties', propertyCount, limits.maxProperties],
  ] as const;

  for (const [label, count, limit] of checks) {
    if (count > limit) {
      report.errors.push(issue(
        'error',
        `resource-${label}`,
        `Ontology contains ${count.toLocaleString()} ${label}; the limit is ${limit.toLocaleString()}.`,
      ));
    }
  }

  return report;
}

function validateExternalCore(ontology: Ontology): ValidationReport {
  const report = emptyReport();
  const entityIds = new Set<string>();
  const relationshipIds = new Set<string>();

  if (ontology.entityTypes.length === 0) {
    report.errors.push(issue(
      'error',
      'ontology-empty',
      'Ontology must contain at least one class.',
    ));
  }

  for (const entity of ontology.entityTypes) {
    if (!entity.id.trim()) {
      report.errors.push(issue(
        'error',
        'entity-id-empty',
        `External class "${entity.name}" must have a stable identifier.`,
      ));
    } else if (entityIds.has(entity.id)) {
      report.errors.push(issue(
        'error',
        'entity-id-duplicate',
        `Duplicate external class identifier "${entity.id}".`,
      ));
    } else {
      entityIds.add(entity.id);
    }

    const propertyNames = new Set<string>();
    for (const property of entity.properties) {
      if (!property.name.trim()) {
        report.errors.push(issue(
          'error',
          'property-name-empty',
          `Properties on "${entity.name}" must have a stable name.`,
        ));
      } else if (propertyNames.has(property.name)) {
        report.errors.push(issue(
          'error',
          'property-name-duplicate',
          `Duplicate property name "${property.name}" on "${entity.name}".`,
        ));
      } else {
        propertyNames.add(property.name);
      }
    }
  }

  for (const relationship of ontology.relationships) {
    if (!relationship.id.trim()) {
      report.errors.push(issue(
        'error',
        'relationship-id-empty',
        `Relationship "${relationship.name}" must have a stable identifier.`,
      ));
    } else if (relationshipIds.has(relationship.id)) {
      report.errors.push(issue(
        'error',
        'relationship-id-duplicate',
        `Duplicate relationship identifier "${relationship.id}".`,
      ));
    } else {
      relationshipIds.add(relationship.id);
    }

    if (!entityIds.has(relationship.from)) {
      report.errors.push(issue(
        'error',
        'relationship-source',
        `Relationship "${relationship.name}" references missing source "${relationship.from}".`,
      ));
    }
    if (!entityIds.has(relationship.to)) {
      report.errors.push(issue(
        'error',
        'relationship-target',
        `Relationship "${relationship.name}" references missing target "${relationship.to}".`,
      ));
    }
  }

  return report;
}

function externalCompatibilityWarnings(
  ontology: Ontology,
): ValidationIssue[] {
  const warnings: ValidationIssue[] = [];
  const missingIdentifierCount = ontology.entityTypes.filter(
    (entity) => !entity.properties.some((property) => property.isIdentifier),
  ).length;
  const incompatibleNameCount = ontology.entityTypes.filter(
    (entity) =>
      entity.name.length > 26 || !FABRIC_NAME_PATTERN.test(entity.name),
  ).length;

  if (missingIdentifierCount > 0) {
    warnings.push(issue(
      'warning',
      'designer-identifiers',
      `${missingIdentifierCount.toLocaleString()} external classes do not define Designer identifier properties; catalogue browsing remains supported.`,
    ));
  }
  if (incompatibleNameCount > 0) {
    warnings.push(issue(
      'warning',
      'designer-entity-names',
      `${incompatibleNameCount.toLocaleString()} external class labels do not meet Designer naming conventions; their source labels are preserved.`,
    ));
  }

  return warnings;
}

export function validateOntologyForTier(
  ontology: Ontology,
  tier: CatalogueTier,
  limits: ValidationLimits = DEFAULT_VALIDATION_LIMITS,
): ValidationReport {
  const report = validateResourceLimits(ontology, limits);

  if (profileForTier(tier) === 'authored') {
    const designerReport = validateOntology(ontology);
    for (const validationError of designerReport) {
      appendIssue(
        report,
        issue('error', 'designer-validation', validationError.message),
      );
    }
    return report;
  }

  const coreReport = validateExternalCore(ontology);
  report.errors.push(...coreReport.errors);
  report.warnings.push(
    ...coreReport.warnings,
    ...externalCompatibilityWarnings(ontology),
  );
  return report;
}

export function mergeValidationReports(
  ...reports: ValidationReport[]
): ValidationReport {
  return {
    errors: reports.flatMap((report) => report.errors),
    warnings: reports.flatMap((report) => report.warnings),
  };
}
