import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseRDF } from './parser';

describe('parseRDF with real FIBO mortgage ontology', () => {
  const mortgageRdf = readFileSync(
    resolve(__dirname, '../../../buggy-ontologies/mortgage-ontology.rdf'),
    'utf-8',
  );

  it('parses the ontology without throwing', () => {
    expect(() => parseRDF(mortgageRdf)).not.toThrow();
  });

  it('extracts ontology metadata', () => {
    const { ontology } = parseRDF(mortgageRdf);
    expect(ontology.name).toBe('Mortgages Ontology');
    // dcterms:abstract should be picked up as the description
    expect(ontology.description).toContain('loans secured by real property');
  });

  it('extracts owl:imports', () => {
    const { ontology } = parseRDF(mortgageRdf);
    expect(ontology.imports).toBeDefined();
    expect(ontology.imports!.length).toBeGreaterThan(0);
    // Should include known FIBO imports
    expect(ontology.imports!.some(u => u.includes('Debt'))).toBe(true);
    expect(ontology.imports!.some(u => u.includes('Loans'))).toBe(true);
  });

  it('extracts all local classes', () => {
    const { ontology } = parseRDF(mortgageRdf);
    const local = ontology.entityTypes.filter(e => !e.isExternal);
    const localNames = local.map(e => e.name).sort();
    expect(localNames).toContain('closed-end mortgage loan');
    expect(localNames).toContain('mortgage');
    expect(localNames).toContain('loan secured by real estate');
    expect(localNames).toContain('reverse mortgage loan');
    expect(localNames).toContain('open-end mortgage loan');
    expect(localNames).toContain('closed-end reverse mortgage');
    expect(localNames).toContain('open-end reverse mortgage');
    expect(local.length).toBe(7);
  });

  it('creates external stub entities for referenced classes', () => {
    const { ontology } = parseRDF(mortgageRdf);
    const external = ontology.entityTypes.filter(e => e.isExternal);
    expect(external.length).toBeGreaterThan(0);
    // All external entities should have the stub icon and color
    for (const ext of external) {
      expect(ext.icon).toBe('🔗');
      expect(ext.color).toBe('#888888');
      expect(ext.isExternal).toBe(true);
    }
  });

  it('extracts class descriptions from skos:definition', () => {
    const { ontology } = parseRDF(mortgageRdf);
    const mortgage = ontology.entityTypes.find(e => e.name === 'mortgage');
    expect(mortgage).toBeDefined();
    expect(mortgage!.description).toContain('grant of financial interest in real property');
  });

  it('creates inheritance relationships', () => {
    const { ontology } = parseRDF(mortgageRdf);
    const inherits = ontology.relationships.filter(r => r.name === 'inherits');
    // ClosedEndMortgageLoan inherits from ClosedEndCredit and LoanSecuredByRealEstate, etc.
    expect(inherits.length).toBeGreaterThanOrEqual(5);
  });

  it('creates restriction-based relationships', () => {
    const { ontology } = parseRDF(mortgageRdf);
    // LoanSecuredByRealEstate has restrictions using isCollateralizedBy, hasContractualElement, etc.
    const restrictionRels = ontology.relationships.filter(r => r.name !== 'inherits');
    expect(restrictionRels.length).toBeGreaterThan(0);
  });

  it('attaches the isARMConvertible datatype property to the correct entity', () => {
    const { ontology } = parseRDF(mortgageRdf);
    const loanEntity = ontology.entityTypes.find(e => e.id === 'loanSecuredByRealEstate');
    expect(loanEntity).toBeDefined();
    const prop = loanEntity!.properties.find(p => p.name === 'is ARM convertible');
    expect(prop).toBeDefined();
    expect(prop!.type).toBe('boolean');
  });

  it('all relationships reference valid entity IDs (no dangling edges)', () => {
    const { ontology } = parseRDF(mortgageRdf);
    const entityIds = new Set(ontology.entityTypes.map(e => e.id));
    for (const rel of ontology.relationships) {
      expect(entityIds.has(rel.from)).toBe(true);
      expect(entityIds.has(rel.to)).toBe(true);
    }
  });

  it('all relationship IDs are unique', () => {
    const { ontology } = parseRDF(mortgageRdf);
    const ids = ontology.relationships.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
