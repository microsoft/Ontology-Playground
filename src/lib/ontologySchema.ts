import type {
  EntityType,
  Ontology,
  OntologyRdfMetadata,
  PreservedSourceFeature,
  Property,
  Relationship,
  RelationshipAttribute,
} from '../data/ontology';

const PROPERTY_TYPES: readonly Property['type'][] = [
  'string',
  'integer',
  'decimal',
  'double',
  'date',
  'datetime',
  'boolean',
  'enum',
];

const CARDINALITIES: readonly Relationship['cardinality'][] = [
  'one-to-one',
  'one-to-many',
  'many-to-one',
  'many-to-many',
];

const RELATIONSHIP_KINDS: readonly NonNullable<Relationship['kind']>[] = [
  'association',
  'subclass',
];

const PRESERVED_SOURCE_FEATURES: readonly PreservedSourceFeature[] = [
  'owlImports',
  'shacl',
];

export interface OntologySchemaIssue {
  path: string;
  message: string;
}

export interface OntologySchemaOptions {
  defaultEntityColors?: readonly string[];
}

export interface OntologySchemaResult {
  ontology: Ontology | null;
  issues: OntologySchemaIssue[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function addIssue(
  issues: OntologySchemaIssue[],
  path: string,
  expectation: string,
): void {
  issues.push({
    path,
    message: `${path} must be ${expectation}.`,
  });
}

function readString(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: OntologySchemaIssue[],
  defaultValue?: string,
): string {
  const value = record[key];
  if (value === undefined && defaultValue !== undefined) {
    return defaultValue;
  }
  if (typeof value !== 'string') {
    addIssue(issues, path, 'a string');
    return defaultValue ?? '';
  }
  return value;
}

function readOptionalString(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: OntologySchemaIssue[],
): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    addIssue(issues, path, 'a string when provided');
    return undefined;
  }
  return value;
}

function readStringArray(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: OntologySchemaIssue[],
): string[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    addIssue(issues, path, 'an array');
    return [];
  }
  return value.map((item, index) => {
    if (typeof item !== 'string') {
      addIssue(issues, `${path}[${index}]`, 'a string');
      return '';
    }
    return item;
  });
}

function isAllowedValue<T extends string>(
  value: unknown,
  allowedValues: readonly T[],
): value is T {
  return typeof value === 'string'
    && allowedValues.some((allowedValue) => allowedValue === value);
}

function readEnum<T extends string>(
  record: Record<string, unknown>,
  key: string,
  path: string,
  allowedValues: readonly T[],
  fallback: T,
  issues: OntologySchemaIssue[],
): T {
  const value = record[key];
  if (!isAllowedValue(value, allowedValues)) {
    addIssue(issues, path, `one of: ${allowedValues.join(', ')}`);
    return fallback;
  }
  return value;
}

function readOptionalEnum<T extends string>(
  record: Record<string, unknown>,
  key: string,
  path: string,
  allowedValues: readonly T[],
  issues: OntologySchemaIssue[],
): T | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (!isAllowedValue(value, allowedValues)) {
    addIssue(issues, path, `one of: ${allowedValues.join(', ')} when provided`);
    return undefined;
  }
  return value;
}

function parseProperty(
  value: unknown,
  path: string,
  issues: OntologySchemaIssue[],
): Property {
  if (!isRecord(value)) {
    addIssue(issues, path, 'an object');
    return { name: '', type: 'string' };
  }

  const property: Property = {
    name: readString(value, 'name', `${path}.name`, issues),
    type: readEnum(
      value,
      'type',
      `${path}.type`,
      PROPERTY_TYPES,
      'string',
      issues,
    ),
  };

  if (value.isIdentifier !== undefined) {
    if (typeof value.isIdentifier === 'boolean') {
      property.isIdentifier = value.isIdentifier;
    } else {
      addIssue(issues, `${path}.isIdentifier`, 'a boolean when provided');
    }
  }

  const unit = readOptionalString(value, 'unit', `${path}.unit`, issues);
  if (unit !== undefined) property.unit = unit;

  const description = readOptionalString(
    value,
    'description',
    `${path}.description`,
    issues,
  );
  if (description !== undefined) property.description = description;

  if (value.values !== undefined) {
    if (!Array.isArray(value.values)) {
      addIssue(issues, `${path}.values`, 'an array of strings when provided');
    } else {
      const enumValues: string[] = [];
      value.values.forEach((enumValue, index) => {
        if (typeof enumValue === 'string') {
          enumValues.push(enumValue);
        } else {
          addIssue(issues, `${path}.values[${index}]`, 'a string');
        }
      });
      property.values = enumValues;
    }
  }

  return property;
}

function parseEntity(
  value: unknown,
  index: number,
  defaultColors: readonly string[],
  issues: OntologySchemaIssue[],
): EntityType {
  const path = `entityTypes[${index}]`;
  if (!isRecord(value)) {
    addIssue(issues, path, 'an object');
    return {
      id: '',
      name: '',
      description: '',
      properties: [],
      icon: '📦',
      color: defaultColors[index % defaultColors.length] ?? '',
    };
  }

  let properties: Property[] = [];
  if (!Array.isArray(value.properties)) {
    addIssue(issues, `${path}.properties`, 'an array');
  } else {
    properties = value.properties.map((property, propertyIndex) =>
      parseProperty(property, `${path}.properties[${propertyIndex}]`, issues)
    );
  }

  let color: string;
  if (value.color === undefined || value.color === '') {
    color = defaultColors[index % defaultColors.length] ?? '';
    if (!color) {
      addIssue(issues, `${path}.color`, 'a non-empty string');
    }
  } else if (typeof value.color === 'string') {
    color = value.color;
  } else {
    addIssue(issues, `${path}.color`, 'a string when provided');
    color = defaultColors[index % defaultColors.length] ?? '';
  }

  return {
    id: readString(value, 'id', `${path}.id`, issues),
    name: readString(value, 'name', `${path}.name`, issues),
    description: readString(
      value,
      'description',
      `${path}.description`,
      issues,
      '',
    ),
    properties,
    icon: readString(value, 'icon', `${path}.icon`, issues, '📦'),
    color,
  };
}

function parseRelationshipAttribute(
  value: unknown,
  path: string,
  issues: OntologySchemaIssue[],
): RelationshipAttribute {
  if (!isRecord(value)) {
    addIssue(issues, path, 'an object');
    return { name: '', type: '' };
  }

  return {
    name: readString(value, 'name', `${path}.name`, issues),
    type: readString(value, 'type', `${path}.type`, issues),
  };
}

function parseRelationship(
  value: unknown,
  index: number,
  issues: OntologySchemaIssue[],
): Relationship {
  const path = `relationships[${index}]`;
  if (!isRecord(value)) {
    addIssue(issues, path, 'an object');
    return {
      id: '',
      name: '',
      from: '',
      to: '',
      cardinality: 'one-to-many',
    };
  }

  const relationship: Relationship = {
    id: readString(value, 'id', `${path}.id`, issues),
    name: readString(value, 'name', `${path}.name`, issues),
    from: readString(value, 'from', `${path}.from`, issues),
    to: readString(value, 'to', `${path}.to`, issues),
    cardinality: readEnum(
      value,
      'cardinality',
      `${path}.cardinality`,
      CARDINALITIES,
      'one-to-many',
      issues,
    ),
  };

  const kind = readOptionalEnum(
    value,
    'kind',
    `${path}.kind`,
    RELATIONSHIP_KINDS,
    issues,
  );
  if (kind !== undefined) relationship.kind = kind;

  const description = readOptionalString(
    value,
    'description',
    `${path}.description`,
    issues,
  );
  if (description !== undefined) relationship.description = description;

  if (value.attributes !== undefined) {
    if (!Array.isArray(value.attributes)) {
      addIssue(issues, `${path}.attributes`, 'an array when provided');
    } else {
      relationship.attributes = value.attributes.map((attribute, attributeIndex) =>
        parseRelationshipAttribute(
          attribute,
          `${path}.attributes[${attributeIndex}]`,
          issues,
        )
      );
    }
  }

  return relationship;
}

function parseRdfMetadata(
  value: unknown,
  issues: OntologySchemaIssue[],
): OntologyRdfMetadata | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    addIssue(issues, 'rdfMetadata', 'an object when provided');
    return undefined;
  }

  const preservedSourceFeatures = readStringArray(
    value,
    'preservedSourceFeatures',
    'rdfMetadata.preservedSourceFeatures',
    issues,
  ).filter((feature): feature is PreservedSourceFeature => {
    if (isAllowedValue(feature, PRESERVED_SOURCE_FEATURES)) return true;
    addIssue(
      issues,
      'rdfMetadata.preservedSourceFeatures',
      `an array containing only: ${PRESERVED_SOURCE_FEATURES.join(', ')}`,
    );
    return false;
  });

  const metadata: OntologyRdfMetadata = {
    imports: readStringArray(
      value,
      'imports',
      'rdfMetadata.imports',
      issues,
    ),
    preservedSourceFeatures,
  };
  const optionalFields = [
    'ontologyIri',
    'versionIri',
    'versionInfo',
    'license',
  ] as const;
  for (const field of optionalFields) {
    const fieldValue = readOptionalString(
      value,
      field,
      `rdfMetadata.${field}`,
      issues,
    );
    if (fieldValue !== undefined) metadata[field] = fieldValue;
  }
  return metadata;
}

export function parseOntologyValue(
  value: unknown,
  options: OntologySchemaOptions = {},
): OntologySchemaResult {
  const issues: OntologySchemaIssue[] = [];
  if (!isRecord(value)) {
    addIssue(issues, 'ontology', 'an object');
    return { ontology: null, issues };
  }

  const defaultColors = options.defaultEntityColors ?? [];

  let entityTypes: EntityType[] = [];
  if (!Array.isArray(value.entityTypes)) {
    addIssue(issues, 'entityTypes', 'an array');
  } else {
    entityTypes = value.entityTypes.map((entity, index) =>
      parseEntity(entity, index, defaultColors, issues)
    );
  }

  let relationships: Relationship[] = [];
  if (!Array.isArray(value.relationships)) {
    addIssue(issues, 'relationships', 'an array');
  } else {
    relationships = value.relationships.map((relationship, index) =>
      parseRelationship(relationship, index, issues)
    );
  }

  const ontology: Ontology = {
    name: readString(value, 'name', 'name', issues),
    description: readString(
      value,
      'description',
      'description',
      issues,
      '',
    ),
    entityTypes,
    relationships,
  };
  const rdfMetadata = parseRdfMetadata(value.rdfMetadata, issues);
  if (rdfMetadata) ontology.rdfMetadata = rdfMetadata;

  return {
    ontology: issues.length === 0 ? ontology : null,
    issues,
  };
}
