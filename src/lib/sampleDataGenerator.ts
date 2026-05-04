/**
 * Sample data generator for ontology deployment to Fabric.
 * Produces realistic EntityInstance[] for a small set of well-known
 * ontologies (Finance) and a generic fallback for any other ontology.
 *
 * Domain-specific samples (e.g. Wind Power) have intentionally been
 * omitted from this file; users can add their own generators or pass
 * EntityInstance[] directly to the deploy pipeline.
 */

import type { Ontology, EntityInstance } from '../data/ontology';

// ─── Finance Sample Data ───────────────────────────────────────────────────

function generateFinanceCustomers(): EntityInstance[] {
  const names = ['Alice Johnson', 'Bob Smith', 'Carol Williams', 'David Brown', 'Eva Martinez',
    'Frank Lee', 'Grace Kim', 'Henry Davis', 'Iris Patel', 'Jack Wilson'];
  return names.map((name, i) => ({
    id: `cust-${String(i + 1).padStart(3, '0')}`,
    entityTypeId: 'Customer',
    values: {
      customerId: `C-${String(1000 + i)}`,
      name,
      email: `${name.toLowerCase().replace(' ', '.')}@example.com`,
      segment: i < 3 ? 'premium' : i < 7 ? 'standard' : 'basic',
      joinDate: `202${Math.floor(i / 3)}-${String((i % 12) + 1).padStart(2, '0')}-15`,
    },
  }));
}

function generateFinanceAccounts(): EntityInstance[] {
  const types = ['checking', 'savings', 'checking', 'savings', 'investment'];
  return types.map((type, i) => ({
    id: `acct-${String(i + 1).padStart(3, '0')}`,
    entityTypeId: 'Account',
    values: {
      accountId: `A-${String(2000 + i)}`,
      type,
      balance: Math.round((5000 + Math.random() * 95000) * 100) / 100,
      currency: 'USD',
      openDate: `2022-${String((i * 2 % 12) + 1).padStart(2, '0')}-01`,
      isActive: true,
    },
  }));
}

function generateFinanceTransactions(): EntityInstance[] {
  const categories = ['deposit', 'withdrawal', 'transfer', 'payment', 'fee'];
  const transactions: EntityInstance[] = [];
  for (let i = 0; i < 30; i++) {
    const cat = categories[i % categories.length];
    transactions.push({
      id: `txn-${String(i + 1).padStart(3, '0')}`,
      entityTypeId: 'Transaction',
      values: {
        transactionId: `TXN-${String(3000 + i)}`,
        amount: Math.round((cat === 'fee' ? 5 + Math.random() * 25 : 50 + Math.random() * 5000) * 100) / 100,
        type: cat,
        timestamp: `2025-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}T${String(9 + (i % 9))}:${String(i % 60).padStart(2, '0')}:00Z`,
        description: `${cat.charAt(0).toUpperCase() + cat.slice(1)} - ref ${i + 1}`,
        status: i < 28 ? 'completed' : 'pending',
      },
    });
  }
  return transactions;
}

// ─── Public API ────────────────────────────────────────────────────────────

export interface GeneratedData {
  ontologyName: string;
  tables: Map<string, EntityInstance[]>;
}

/**
 * Generate sample data for an ontology based on its name/slug.
 * - Finance / banking ontologies get a curated dataset.
 * - All other ontologies get a generic per-entity dataset based on property types.
 */
export function generateSampleData(ontology: Ontology): GeneratedData {
  const tables = new Map<string, EntityInstance[]>();
  const name = ontology.name.toLowerCase();

  if (name.includes('finance') || name.includes('banking')) {
    tables.set('Customer', generateFinanceCustomers());
    tables.set('Account', generateFinanceAccounts());
    tables.set('Transaction', generateFinanceTransactions());
  } else {
    for (const entity of ontology.entityTypes) {
      const instances: EntityInstance[] = [];
      for (let i = 0; i < 5; i++) {
        const values: Record<string, unknown> = {};
        for (const prop of entity.properties) {
          values[prop.name] = generateDefaultValue(prop.type, prop.name, i);
        }
        instances.push({ id: `${entity.id}-${i + 1}`, entityTypeId: entity.id, values });
      }
      tables.set(entity.name, instances);
    }
  }

  return { ontologyName: ontology.name, tables };
}

function generateDefaultValue(type: string, name: string, index: number): unknown {
  switch (type) {
    case 'string': return `${name}_${index + 1}`;
    case 'integer': return index * 10 + 1;
    case 'decimal':
    case 'double': return Math.round((index * 10.5 + 1) * 100) / 100;
    case 'boolean': return index % 2 === 0;
    case 'date': return `2025-${String((index % 12) + 1).padStart(2, '0')}-01`;
    case 'datetime': return `2025-${String((index % 12) + 1).padStart(2, '0')}-01T00:00:00Z`;
    default: return `${name}_${index + 1}`;
  }
}

/**
 * Convert EntityInstance[] to CSV string for Lakehouse upload.
 */
export function instancesToCSV(instances: EntityInstance[]): string {
  if (instances.length === 0) return '';

  const columns = Object.keys(instances[0].values);
  const header = columns.join(',');
  const rows = instances.map(inst =>
    columns.map(col => {
      const val = inst.values[col];
      if (val === null || val === undefined) return '';
      if (typeof val === 'string') return `"${val.replace(/"/g, '""')}"`;
      return String(val);
    }).join(','),
  );

  return [header, ...rows].join('\n');
}
