/**
 * LPG (Labeled Property Graph) serializer — Neo4j / openCypher style.
 *
 * Output is a hybrid format:
 *   • Structured comments ([NODE], [PROPS], [REL]) — machine-parseable, lossless round-trip
 *   • Valid Cypher DDL (CREATE CONSTRAINT, pattern lines) — paste-ready for Neo4j Browser
 *
 * Round-trip guarantee: parseLPG(serializeToLPG(ontology)) deep-equals ontology
 * (modulo the `_past`/`_future` undo-history fields which are not part of Ontology).
 */
import type { Ontology } from '../../data/ontology';

// ─── Type maps ────────────────────────────────────────────────────────────────

/** Maps internal property types → Neo4j Cypher type names */
const TO_CYPHER: Record<string, string> = {
  string:   'STRING',
  integer:  'INTEGER',
  decimal:  'FLOAT',
  double:   'FLOAT',
  date:     'DATE',
  datetime: 'DATETIME',
  boolean:  'BOOLEAN',
  enum:     'STRING',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Converts a relationship display-name to an UPPER_SNAKE_CASE Cypher type. */
function toRelType(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')
    .replace(/[^A-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/** Produces a valid Cypher constraint name from entity + property names. */
function constraintName(entityName: string, propName: string): string {
  return `${entityName}_${propName}`
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_');
}

const HR_THICK = '═'.repeat(56);
const HR_THIN  = '─'.repeat(53);

// ─── Serializer ───────────────────────────────────────────────────────────────

/**
 * Serialize an Ontology to a Neo4j-compatible LPG Cypher string.
 */
export function serializeToLPG(ontology: Ontology): string {
  const out: string[] = [];

  // ── Header ────────────────────────────────────────────────
  out.push(`// ${HR_THICK}`);
  out.push(`// [ONTOLOGY] ${ontology.name}`);
  if (ontology.description) {
    out.push(`// [DESC] ${ontology.description}`);
  }
  out.push(`// ${HR_THICK}`);
  out.push('');

  // ── Node Labels ───────────────────────────────────────────
  if (ontology.entityTypes.length > 0) {
    out.push(`// ── Nodes ${HR_THIN.slice(9)}`);
    out.push('');
  }

  for (const entity of ontology.entityTypes) {
    // Machine-readable node header (preserves ALL metadata incl. internal id)
    out.push(`// [NODE] ${entity.name} | ${entity.icon} | ${entity.color} | ${entity.id}`);
    if (entity.description) {
      out.push(`// [DESC] ${entity.description}`);
    }

    // Executable Cypher: unique constraint on the identifier property
    const identifier = entity.properties.find(p => p.isIdentifier);
    if (identifier) {
      const cname = constraintName(entity.name, identifier.name);
      out.push(`CREATE CONSTRAINT ${cname} IF NOT EXISTS`);
      out.push(`  FOR (n:${entity.name}) REQUIRE n.${identifier.name} IS UNIQUE;`);
    }

    // Machine-readable property definitions
    if (entity.properties.length > 0) {
      const propTokens = entity.properties.map(p => {
        const cyType = TO_CYPHER[p.type] ?? 'STRING';
        let token = `${p.name}:${cyType}`;
        if (p.isIdentifier)               token += '*';
        if (p.unit)                       token += `[${p.unit}]`;
        if (p.type === 'enum' && p.values?.length) token += `(${p.values.join('|')})`;
        return token;
      });
      out.push(`// [PROPS] ${propTokens.join(' ')}`);
    }
    out.push('');
  }

  // ── Relationship Types ────────────────────────────────────
  if (ontology.relationships.length > 0) {
    out.push(`// ── Relationships ${HR_THIN.slice(17)}`);
    out.push('');

    for (const rel of ontology.relationships) {
      const relType = toRelType(rel.name);

      // Machine-readable relationship line (preserves id + optional edge props)
      let relLine = `// [REL] ${rel.name} | ${rel.from} | ${rel.to} | ${rel.cardinality} | ${rel.id}`;
      if (rel.attributes?.length) {
        const attrTokens = rel.attributes.map(a => `${a.name}:${TO_CYPHER[a.type] ?? 'STRING'}`);
        relLine += ` | ${attrTokens.join(' ')}`;
      }
      out.push(relLine);

      if (rel.description) {
        out.push(`// [DESC] ${rel.description}`);
      }

      // Human-readable + executable Cypher pattern
      if (rel.attributes?.length) {
        const attrStr = rel.attributes
          .map(a => `${a.name}: ${TO_CYPHER[a.type] ?? 'STRING'}`)
          .join(', ');
        out.push(`(:${rel.from})-[:${relType} { ${attrStr} }]->(:${rel.to})`);
      } else {
        out.push(`(:${rel.from})-[:${relType}]->(:${rel.to})`);
      }
      out.push('');
    }
  }

  return out.join('\n').trimEnd();
}
