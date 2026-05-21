/**
 * Fabric deployment pipeline — orchestrates full solution deployment.
 *
 * Sequence:
 *   1. Authenticate via MSAL
 *   2. Create Fabric IQ Ontology
 *   3. Create Lakehouse + populate tables with sample data
 *   4. Create Semantic Model bound to Lakehouse
 *   5. Create GraphQL API backed by Lakehouse
 */

import type { Ontology } from '../data/ontology';
import { acquireFabricToken } from './msalAuth';
import { createOntology, type FabricOntologyResponse } from './fabric';
import { createLakehouse, uploadEntityTable } from './fabricLakehouse';
import { createSemanticModel, type SemanticModelResponse } from './fabricSemanticModel';
import { createGraphQLApi, type GraphQLApiResponse } from './fabricGraphQL';
import { generateSampleData } from './sampleDataGenerator';

// ─── Types ─────────────────────────────────────────────────────────────────

export type DeployStepId =
  | 'authenticate'
  | 'ontology'
  | 'lakehouse'
  | 'populate-tables'
  | 'semantic-model'
  | 'graphql-api';

export type DeployStepStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped';

export interface DeployStep {
  id: DeployStepId;
  label: string;
  status: DeployStepStatus;
  error?: string;
  resultId?: string;
  resultName?: string;
}

export interface DeployConfig {
  workspaceId: string;
  ontologies: Ontology[];
  createOntologyItem: boolean;
  createLakehouse: boolean;
  createSemanticModel: boolean;
  createGraphQLApi: boolean;
  /** Pre-acquired access token — skips the authenticate step if provided */
  accessToken?: string;
  accountName?: string;
}

export interface DeployResult {
  steps: DeployStep[];
  ontologyResults: FabricOntologyResponse[];
  lakehouseId?: string;
  lakehouseName?: string;
  semanticModelResults: SemanticModelResponse[];
  graphQLApiResults: GraphQLApiResponse[];
}

export type OnProgress = (steps: DeployStep[]) => void;

// ─── Pipeline ──────────────────────────────────────────────────────────────

function createSteps(config: DeployConfig): DeployStep[] {
  const steps: DeployStep[] = [
    { id: 'authenticate', label: 'Authenticate with Microsoft', status: 'pending' },
  ];

  if (config.createOntologyItem) {
    steps.push({ id: 'ontology', label: `Create Ontology (${config.ontologies.length} items)`, status: 'pending' });
  }
  if (config.createLakehouse) {
    steps.push({ id: 'lakehouse', label: 'Create Lakehouse', status: 'pending' });
    steps.push({ id: 'populate-tables', label: 'Populate data tables', status: 'pending' });
  }
  if (config.createSemanticModel) {
    steps.push({ id: 'semantic-model', label: 'Create Semantic Model', status: 'pending' });
  }
  if (config.createGraphQLApi) {
    steps.push({ id: 'graphql-api', label: 'Create GraphQL API', status: 'pending' });
  }

  return steps;
}

function updateStep(
  steps: DeployStep[],
  id: DeployStepId,
  update: Partial<DeployStep>,
  onProgress: OnProgress,
): void {
  const step = steps.find(s => s.id === id);
  if (step) Object.assign(step, update);
  onProgress([...steps]);
}

/**
 * Execute the full deployment pipeline.
 */
export async function deployToFabric(
  config: DeployConfig,
  onProgress: OnProgress,
): Promise<DeployResult> {
  const steps = createSteps(config);
  onProgress(steps);

  const result: DeployResult = {
    steps,
    ontologyResults: [],
    semanticModelResults: [],
    graphQLApiResults: [],
  };

  // Step 1: Authenticate (use pre-acquired token if available)
  updateStep(steps, 'authenticate', { status: 'running' }, onProgress);
  let token: string;
  try {
    if (config.accessToken) {
      token = config.accessToken;
      updateStep(steps, 'authenticate', {
        status: 'success',
        resultName: config.accountName ?? 'Pre-authenticated',
      }, onProgress);
    } else {
      const authResult = await acquireFabricToken();
      token = authResult.accessToken;
      updateStep(steps, 'authenticate', {
        status: 'success',
        resultName: authResult.account.name,
      }, onProgress);
    }
  } catch (err) {
    updateStep(steps, 'authenticate', {
      status: 'error',
      error: err instanceof Error ? err.message : 'Authentication failed',
    }, onProgress);
    return result;
  }

  // Step 2: Create Ontology items
  if (config.createOntologyItem) {
    updateStep(steps, 'ontology', { status: 'running' }, onProgress);
    try {
      for (const ont of config.ontologies) {
        const created = await createOntology(config.workspaceId, token, ont);
        result.ontologyResults.push(created);
      }
      updateStep(steps, 'ontology', {
        status: 'success',
        resultId: result.ontologyResults[0]?.id,
        resultName: `${result.ontologyResults.length} ontologies created`,
      }, onProgress);
    } catch (err) {
      updateStep(steps, 'ontology', {
        status: 'error',
        error: err instanceof Error ? err.message : 'Failed to create ontology',
      }, onProgress);
    }
  }

  // Step 3: Create Lakehouse
  let lakehouseId: string | undefined;
  if (config.createLakehouse) {
    updateStep(steps, 'lakehouse', { status: 'running' }, onProgress);
    try {
      const lhName = `${config.ontologies[0]?.name ?? 'Ontology'}_Lakehouse`.replace(/[^a-zA-Z0-9_]/g, '_');
      const lh = await createLakehouse(
        config.workspaceId, token, lhName,
        `Auto-generated lakehouse for ${config.ontologies.map(o => o.name).join(', ')}`,
      );
      lakehouseId = lh.id;
      result.lakehouseId = lh.id;
      result.lakehouseName = lh.displayName;
      updateStep(steps, 'lakehouse', {
        status: 'success',
        resultId: lh.id,
        resultName: lh.displayName,
      }, onProgress);
    } catch (err) {
      updateStep(steps, 'lakehouse', {
        status: 'error',
        error: err instanceof Error ? err.message : 'Failed to create lakehouse',
      }, onProgress);
    }

    // Step 4: Populate tables
    if (lakehouseId) {
      updateStep(steps, 'populate-tables', { status: 'running' }, onProgress);
      try {
        let tableCount = 0;
        for (const ont of config.ontologies) {
          const data = generateSampleData(ont);
          for (const [tableName, instances] of data.tables) {
            await uploadEntityTable(config.workspaceId, lakehouseId, token, tableName, instances);
            tableCount++;
          }
        }
        updateStep(steps, 'populate-tables', {
          status: 'success',
          resultName: `${tableCount} tables populated`,
        }, onProgress);
      } catch (err) {
        updateStep(steps, 'populate-tables', {
          status: 'error',
          error: err instanceof Error ? err.message : 'Failed to populate tables',
        }, onProgress);
      }
    } else {
      updateStep(steps, 'populate-tables', { status: 'skipped', error: 'Lakehouse not created' }, onProgress);
    }
  }

  // Step 5: Create Semantic Model
  if (config.createSemanticModel) {
    updateStep(steps, 'semantic-model', { status: 'running' }, onProgress);
    if (lakehouseId) {
      try {
        for (const ont of config.ontologies) {
          const sm = await createSemanticModel(config.workspaceId, token, ont, lakehouseId);
          result.semanticModelResults.push(sm);
        }
        updateStep(steps, 'semantic-model', {
          status: 'success',
          resultId: result.semanticModelResults[0]?.id,
          resultName: `${result.semanticModelResults.length} models created`,
        }, onProgress);
      } catch (err) {
        updateStep(steps, 'semantic-model', {
          status: 'error',
          error: err instanceof Error ? err.message : 'Failed to create semantic model',
        }, onProgress);
      }
    } else {
      updateStep(steps, 'semantic-model', { status: 'skipped', error: 'Lakehouse required' }, onProgress);
    }
  }

  // Step 6: Create GraphQL API
  if (config.createGraphQLApi) {
    updateStep(steps, 'graphql-api', { status: 'running' }, onProgress);
    if (lakehouseId) {
      try {
        for (const ont of config.ontologies) {
          const api = await createGraphQLApi(
            config.workspaceId, token,
            `${ont.name} - GraphQL API`,
            `GraphQL API for ${ont.name} ontology`,
            lakehouseId,
          );
          result.graphQLApiResults.push(api);
        }
        updateStep(steps, 'graphql-api', {
          status: 'success',
          resultId: result.graphQLApiResults[0]?.id,
          resultName: `${result.graphQLApiResults.length} APIs created`,
        }, onProgress);
      } catch (err) {
        updateStep(steps, 'graphql-api', {
          status: 'error',
          error: err instanceof Error ? err.message : 'Failed to create GraphQL API',
        }, onProgress);
      }
    } else {
      updateStep(steps, 'graphql-api', { status: 'skipped', error: 'Lakehouse required' }, onProgress);
    }
  }

  result.steps = steps;
  return result;
}
