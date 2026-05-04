import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./msalAuth', () => ({
  acquireFabricToken: vi.fn(),
}));
vi.mock('./fabric', () => ({
  createOntology: vi.fn(),
}));
vi.mock('./fabricLakehouse', () => ({
  createLakehouse: vi.fn(),
  uploadEntityTable: vi.fn(),
}));
vi.mock('./fabricSemanticModel', () => ({
  createSemanticModel: vi.fn(),
}));
vi.mock('./fabricGraphQL', () => ({
  createGraphQLApi: vi.fn(),
}));
vi.mock('./sampleDataGenerator', () => ({
  generateSampleData: vi.fn(),
}));

import { deployToFabric, type DeployConfig, type DeployStep } from './fabricDeployPipeline';
import { acquireFabricToken } from './msalAuth';
import { createOntology } from './fabric';
import { createLakehouse, uploadEntityTable } from './fabricLakehouse';
import { createSemanticModel } from './fabricSemanticModel';
import { createGraphQLApi } from './fabricGraphQL';
import { generateSampleData } from './sampleDataGenerator';

const testOntology = {
  name: 'TestOntology',
  entityTypes: [
    {
      id: 'customer',
      name: 'Customer',
      icon: '👤',
      color: '#fff',
      properties: [{ name: 'id', type: 'string', isIdentifier: true }],
    },
  ],
  relationships: [],
};

function fullConfig(overrides: Partial<DeployConfig> = {}): DeployConfig {
  return {
    workspaceId: 'ws-1',
    ontologies: [testOntology as any],
    createOntologyItem: true,
    createLakehouse: true,
    createSemanticModel: true,
    createGraphQLApi: true,
    accessToken: 'pre-token',
    accountName: 'Test User',
    ...overrides,
  };
}

describe('fabricDeployPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (acquireFabricToken as any).mockResolvedValue({ accessToken: 'tok', account: { name: 'User' } });
    (createOntology as any).mockResolvedValue({ id: 'ont-1', displayName: 'TestOntology' });
    (createLakehouse as any).mockResolvedValue({ id: 'lh-1', displayName: 'TestOntology_Lakehouse' });
    (uploadEntityTable as any).mockResolvedValue(undefined);
    (createSemanticModel as any).mockResolvedValue({ id: 'sm-1', displayName: 'TestOntology_SemanticModel' });
    (createGraphQLApi as any).mockResolvedValue({ id: 'gql-1', displayName: 'TestOntology - GraphQL API' });
    (generateSampleData as any).mockReturnValue({
      tables: new Map([['Customer', [{ id: '1', entityTypeId: 'customer', values: {} }]]]),
    });
  });

  describe('Authentication', () => {
    it('uses pre-acquired token when accessToken is provided (does NOT call acquireFabricToken)', async () => {
      const config = fullConfig();
      const onProgress = vi.fn();

      await deployToFabric(config, onProgress);

      expect(acquireFabricToken).not.toHaveBeenCalled();
    });

    it('calls acquireFabricToken when no accessToken provided', async () => {
      const config = fullConfig({ accessToken: undefined });
      const onProgress = vi.fn();

      await deployToFabric(config, onProgress);

      expect(acquireFabricToken).toHaveBeenCalled();
    });

    it('auth failure returns early with error step, no further steps run', async () => {
      (acquireFabricToken as any).mockRejectedValue(new Error('Auth failed'));
      const config = fullConfig({ accessToken: undefined });
      const onProgress = vi.fn();

      const result = await deployToFabric(config, onProgress);

      expect(result.steps).toContainEqual(
        expect.objectContaining({
          id: 'authenticate',
          status: 'error',
        })
      );
      // Ensure only authenticate step is in result (auth failures return immediately)
      expect(result.steps.filter(s => s.status !== 'pending').length).toBe(1);
      expect(createOntology).not.toHaveBeenCalled();
      expect(createLakehouse).not.toHaveBeenCalled();
    });
  });

  describe('Full pipeline (all flags true)', () => {
    it('happy path — all steps succeed, result contains all IDs', async () => {
      const config = fullConfig();
      const onProgress = vi.fn();

      const result = await deployToFabric(config, onProgress);

      expect(result.steps).toContainEqual(
        expect.objectContaining({ id: 'authenticate', status: 'success' })
      );
      expect(result.steps).toContainEqual(
        expect.objectContaining({ id: 'ontology', status: 'success' })
      );
      expect(result.steps).toContainEqual(
        expect.objectContaining({ id: 'lakehouse', status: 'success' })
      );
      expect(result.steps).toContainEqual(
        expect.objectContaining({ id: 'populate-tables', status: 'success' })
      );
      expect(result.steps).toContainEqual(
        expect.objectContaining({ id: 'semantic-model', status: 'success' })
      );
      expect(result.steps).toContainEqual(
        expect.objectContaining({ id: 'graphql-api', status: 'success' })
      );

      // Check result contains IDs
      expect(result.lakehouseId).toBe('lh-1');
      expect(result.semanticModelResults[0]?.id).toBe('sm-1');
      expect(result.graphQLApiResults[0]?.id).toBe('gql-1');
    });

    it('verify onProgress is called with correct step statuses (running → success)', async () => {
      const config = fullConfig();
      const onProgress = vi.fn();

      await deployToFabric(config, onProgress);

      // Should be called multiple times
      expect(onProgress).toHaveBeenCalled();
      const calls = onProgress.mock.calls;
      expect(calls.length).toBeGreaterThan(1); // At least initial call + one update

      // Verify structure: each call should contain an array of steps
      for (const call of calls) {
        expect(Array.isArray(call[0])).toBe(true);
        const steps = call[0] as any[];
        expect(steps.length).toBeGreaterThan(0);
        for (const step of steps) {
          expect(step).toHaveProperty('id');
          expect(step).toHaveProperty('status');
          expect(step).toHaveProperty('label');
        }
      }

      // Verify some expected steps exist in the final result
      const lastCall = calls[calls.length - 1][0] as any[];
      const lastCallStepIds = new Set(lastCall.map((s: any) => s.id));
      expect(lastCallStepIds.has('authenticate')).toBe(true);
      expect(lastCallStepIds.has('ontology')).toBe(true);
      expect(lastCallStepIds.has('lakehouse')).toBe(true);

      // Verify that at least authenticate reached success status
      const authStep = lastCall.find((s: any) => s.id === 'authenticate');
      expect(authStep?.status).toBe('success');
    });
  });

  describe('Conditional steps', () => {
    it('createOntologyItem=false → ontology step skipped entirely', async () => {
      const config = fullConfig({ createOntologyItem: false });
      const onProgress = vi.fn();

      const result = await deployToFabric(config, onProgress);

      expect(result.steps).not.toContainEqual(
        expect.objectContaining({ name: 'ontology' })
      );
      expect(createOntology).not.toHaveBeenCalled();
    });

    it('createLakehouse=false → lakehouse and populate-tables steps skipped', async () => {
      const config = fullConfig({ createLakehouse: false });
      const onProgress = vi.fn();

      const result = await deployToFabric(config, onProgress);

      expect(result.steps).not.toContainEqual(
        expect.objectContaining({ name: 'lakehouse' })
      );
      expect(result.steps).not.toContainEqual(
        expect.objectContaining({ name: 'populate-tables' })
      );
      expect(createLakehouse).not.toHaveBeenCalled();
      expect(uploadEntityTable).not.toHaveBeenCalled();
    });

    it('createSemanticModel=false → semantic-model step skipped', async () => {
      const config = fullConfig({ createSemanticModel: false });
      const onProgress = vi.fn();

      const result = await deployToFabric(config, onProgress);

      expect(result.steps).not.toContainEqual(
        expect.objectContaining({ name: 'semantic-model' })
      );
      expect(createSemanticModel).not.toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('lakehouse creation fails → populate-tables, semantic-model, graphql-api all skipped', async () => {
      (createLakehouse as any).mockRejectedValue(new Error('Lakehouse failed'));
      const config = fullConfig();
      const onProgress = vi.fn();

      const result = await deployToFabric(config, onProgress);

      expect(result.steps).toContainEqual(
        expect.objectContaining({ id: 'lakehouse', status: 'error' })
      );
      expect(result.steps).toContainEqual(
        expect.objectContaining({ id: 'populate-tables', status: 'skipped' })
      );
      expect(result.steps).toContainEqual(
        expect.objectContaining({ id: 'semantic-model', status: 'skipped' })
      );
      expect(result.steps).toContainEqual(
        expect.objectContaining({ id: 'graphql-api', status: 'skipped' })
      );
      expect(uploadEntityTable).not.toHaveBeenCalled();
    });

    it('ontology creation fails → step has error, but pipeline continues to lakehouse', async () => {
      (createOntology as any).mockRejectedValue(new Error('Ontology failed'));
      const config = fullConfig();
      const onProgress = vi.fn();

      const result = await deployToFabric(config, onProgress);

      expect(result.steps).toContainEqual(
        expect.objectContaining({ id: 'ontology', status: 'error' })
      );
      // Lakehouse should still be attempted
      expect(result.steps).toContainEqual(
        expect.objectContaining({ id: 'lakehouse', status: 'success' })
      );
      expect(createLakehouse).toHaveBeenCalled();
    });

    it('semantic model creation fails → graphql-api still runs (independent)', async () => {
      (createSemanticModel as any).mockRejectedValue(new Error('Semantic model failed'));
      const config = fullConfig();
      const onProgress = vi.fn();

      const result = await deployToFabric(config, onProgress);

      expect(result.steps).toContainEqual(
        expect.objectContaining({ id: 'semantic-model', status: 'error' })
      );
      // GraphQL API should still be attempted
      expect(result.steps).toContainEqual(
        expect.objectContaining({ id: 'graphql-api', status: 'success' })
      );
      expect(createGraphQLApi).toHaveBeenCalled();
    });
  });

  describe('Table population', () => {
    it('generateSampleData produces tables → uploadEntityTable called for each table', async () => {
      const config = fullConfig();
      const onProgress = vi.fn();

      await deployToFabric(config, onProgress);

      // Should have been called at least once for the 'Customer' table
      expect(uploadEntityTable).toHaveBeenCalled();
      // Signature: uploadEntityTable(workspaceId, lakehouseId, token, tableId, instances)
      expect(uploadEntityTable).toHaveBeenCalledWith(
        'ws-1',         // workspaceId
        'lh-1',         // lakehouseId
        'pre-token',    // token
        'Customer',     // tableId
        expect.any(Array) // instances
      );
    });
  });
});
