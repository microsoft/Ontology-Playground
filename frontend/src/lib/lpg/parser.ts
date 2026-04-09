/**
 * LPG parser — reads the structured-comment format produced by serializeToLPG()
 * and reconstructs an Ontology object with full fidelity.
 *
 * Only the `// [TAG]` comment lines are load-bearing for round-trip.
 * The Cypher DDL lines (CREATE CONSTRAINT, pattern arrows) are ignored by the
 * parser; they exist solely for Neo4j Browser use.
 */
import type {
  Ontology,
  EntityType,
  Property,
  Relationship,
  RelationshipAttribute,
} from '../../data/ontology';

// ─── Type maps ────────────────────────────────────────────────────────────────

/** Neo4j Cypher type names → internal property types */
const FROM_CYPHER: Record<string, Property['type']> = {
  STRING:        'string',
  INTEGER:       'integer',
  INT:           'integer',
  LONG:          'integer',
  FLOAT:         'decimal',
  DOUBLE:        'decimal',
  DECIMAL:       'decimal',
  DATE:          'date',
  DATETIME:      'datetime',
  LOCALDATETIME: 'datetime',
  BOOLEAN:       'boolean',
  BOOL:          'boolean',
};

export class LPGParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LPGParseError';
  }
}

// ─── Prop-string tokeniser ────────────────────────────────────────────────────

/**
 * Parse a [PROPS] token list like:
 *   "customerId:STRING* name:STRING price:FLOAT[USD] status:STRING(pending|active)"
 */
function parseProps(raw: string): Property[] {
  return raw.trim().split(/\s+/).flatMap(token => {
    const colon = token.indexOf(':');
    if (colon < 0) return [];

    const name    = token.slice(0, colon);
    let   rest    = token.slice(colon + 1);

    const isIdentifier = rest.includes('*');
    rest = rest.replace('*', '');

    const unitMatch = rest.match(/\[([^\]]+)\]/);
    const unit      = unitMatch?.[1];
    rest = rest.replace(/\[[^\]]*\]/, '');

    const enumMatch = rest.match(/\(([^)]+)\)/);
    const values    = enumMatch ? enumMatch[1].split('|') : undefined;
    const baseType  = rest.replace(/\([^)]*\)/, '').toUpperCase();

    const type: Property['type'] = values
      ? 'enum'
      : (FROM_CYPHER[baseType] ?? 'string');

    const prop: Property = { name, type };
    if (isIdentifier) prop.isIdentifier = true;
    if (unit)         prop.unit         = unit;
    if (values)       prop.values       = values;
    return [prop];
  });
}

/**
 * Parse the edge-attribute token list from a [REL] line's 6th segment:
 *   "quantity:INTEGER unitPrice:FLOAT"
 */
function parseRelAttrs(raw: string): RelationshipAttribute[] {
  return raw.trim().split(/\s+/).flatMap(token => {
    const colon = token.indexOf(':');
    if (colon < 0) return [];
    const name    = token.slice(0, colon);
    const rawType = token.slice(colon + 1).toUpperCase();
    const type    = FROM_CYPHER[rawType] ?? 'string';
    return [{ name, type } as RelationshipAttribute];
  });
}

// ─── Parser ───────────────────────────────────────────────────────────────────

/**
 * Parse a Neo4j LPG Cypher string (as produced by serializeToLPG) back into
 * an Ontology object.  Throws LPGParseError on structural problems.
 */
export function parseLPG(lpg: string): Ontology {
  if (!lpg.trim()) throw new LPGParseError('Empty input');

  const lines = lpg.split('\n');

  let ontologyName        = '';
  let ontologyDescription = '';
  const entityTypes: EntityType[]   = [];
  const relationships: Relationship[] = [];

  let currentEntity:      EntityType | null = null;
  let pendingRelDesc:     string            = '';
  let inRelSection        = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line.startsWith('//')) continue; // skip non-comment lines (Cypher DDL etc.)

    // Strip the leading `// ` or `//`
    const content = line.replace(/^\/\/\s?/, '');

    // ── [ONTOLOGY] ──────────────────────────────────────────
    if (content.startsWith('[ONTOLOGY]')) {
      ontologyName = content.slice('[ONTOLOGY]'.length).trim();
      continue;
    }

    // ── [DESC] ──────────────────────────────────────────────
    if (content.startsWith('[DESC]')) {
      const desc = content.slice('[DESC]'.length).trim();
      if (inRelSection && relationships.length > 0) {
        // [DESC] after a [REL] line → applies to the most recently added relationship
        relationships[relationships.length - 1].description = desc;
      } else if (currentEntity) {
        if (!currentEntity.description) currentEntity.description = desc;
      } else {
        // ontology-level description (appears right after [ONTOLOGY])
        ontologyDescription = desc;
      }
      continue;
    }

    // ── [NODE] name | icon | color | id ─────────────────────
    if (content.startsWith('[NODE]')) {
      // Flush previous entity
      if (currentEntity) entityTypes.push(currentEntity);

      const parts = content.slice('[NODE]'.length).split('|').map(s => s.trim());
      if (parts.length < 4) {
        throw new LPGParseError(`Malformed [NODE] line: "${line}"`);
      }
      currentEntity = {
        id:          parts[3],
        name:        parts[0],
        icon:        parts[1],
        color:       parts[2],
        description: '',
        properties:  [],
      };
      inRelSection      = false;
      continue;
    }

    // ── [PROPS] propTokens ───────────────────────────────────
    if (content.startsWith('[PROPS]')) {
      if (!currentEntity) throw new LPGParseError('[PROPS] found before any [NODE]');
      currentEntity.properties = parseProps(content.slice('[PROPS]'.length));
      continue;
    }

    // ── [REL] name | from | to | cardinality | id [| attr...] ──
    if (content.startsWith('[REL]')) {
      // Flush pending entity
      if (currentEntity) {
        entityTypes.push(currentEntity);
        currentEntity = null;
      }
      inRelSection = true;

      const parts = content.slice('[REL]'.length).split('|').map(s => s.trim());
      if (parts.length < 5) {
        throw new LPGParseError(`Malformed [REL] line: "${line}"`);
      }

      const [name, from, to, cardinality, id, ...attrSegments] = parts;

      // Validate cardinality value
      const validCardinalities = ['one-to-one', 'one-to-many', 'many-to-one', 'many-to-many'];
      const safeCardinality = (validCardinalities.includes(cardinality)
        ? cardinality
        : 'one-to-many') as Relationship['cardinality'];

      const attributes = attrSegments.length
        ? parseRelAttrs(attrSegments.join(' '))
        : undefined;

      const rel: Relationship = {
        id,
        name,
        from,
        to,
        cardinality: safeCardinality,
        description: pendingRelDesc,
      };
      if (attributes?.length) rel.attributes = attributes;
      pendingRelDesc = '';

      relationships.push(rel);
      continue;
    }
  }

  // Flush last entity if it was never pushed
  if (currentEntity) entityTypes.push(currentEntity);

  if (!ontologyName) {
    throw new LPGParseError('No [ONTOLOGY] header found. Is this a valid LPG file?');
  }

  return {
    name:        ontologyName,
    description: ontologyDescription,
    entityTypes,
    relationships,
  };
}
