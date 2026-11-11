import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  findDeploymentBoundaryViolations,
  findLocalActionReferences,
  validateWorkflowFiles,
} from './validate-deployment-boundaries';

describe('findDeploymentBoundaryViolations', () => {
  it('accepts a static-only Azure Static Web Apps upload', () => {
    const workflow = `
      uses: Azure/static-web-apps-deploy@v1
      with:
        action: upload
        app_location: /
        output_location: build
    `;

    expect(findDeploymentBoundaryViolations('static.yml', workflow)).toEqual([]);
  });

  it.each([
    ['api_location: api', 'Static Web Apps api_location input'],
    ['"api_location": api', 'Static Web Apps api_location input'],
    ['uses: Azure/functions-action@v1', 'Azure Functions deployment action'],
    ['- "uses": "Azure/functions-action@v1"', 'Azure Functions deployment action'],
    [
      'run: func azure functionapp publish ontology-api',
      'Azure Functions Core Tools publish command',
    ],
    [
      'run: az functionapp deployment source config-zip',
      'Azure CLI functionapp command',
    ],
    [
      'run: npx swa deploy build --api-location api',
      'Static Web Apps CLI API deployment',
    ],
    [
      'run: |\n  npx swa deploy build \\\n    --api-location api',
      'Static Web Apps CLI API deployment',
    ],
    [
      'run: npm run deploy:functions',
      'Repository API deployment script',
    ],
  ])('rejects %s', (directive, expectedRule) => {
    expect(findDeploymentBoundaryViolations('deploy.yml', directive)).toEqual([
      {
        rule: expectedRule,
        workflow: 'deploy.yml',
      },
    ]);
  });

  it('ignores policy examples in comments', () => {
    const workflow = '# run: npx swa deploy build --api-location api';

    expect(findDeploymentBoundaryViolations('static.yml', workflow)).toEqual([]);
  });

  it.each([
    'run: npx swa deploy build',
    'run: npm publish --dry-run',
  ])('allows frontend-only command %s', (command) => {
    expect(findDeploymentBoundaryViolations('static.yml', command)).toEqual([]);
  });
});

describe('local action validation', () => {
  it('recognizes local actions in workflow step syntax', () => {
    expect(findLocalActionReferences(`
      steps:
        - uses: ./.github/actions/publish-functions
        - "uses": "./.github/actions/setup"
    `)).toEqual([
      './.github/actions/publish-functions',
      './.github/actions/setup',
    ]);
  });

  it('recursively validates local action definitions', () => {
    const repositoryRoot = mkdtempSync(
      join(tmpdir(), 'deployment-boundary-'),
    );
    const workflowDirectory = join(repositoryRoot, '.github/workflows');
    const actionDirectory = join(
      repositoryRoot,
      '.github/actions/publish-functions',
    );

    try {
      mkdirSync(workflowDirectory, { recursive: true });
      mkdirSync(actionDirectory, { recursive: true });
      writeFileSync(
        join(workflowDirectory, 'deploy.yml'),
        'steps:\n  - uses: ./.github/actions/publish-functions\n',
      );
      writeFileSync(
        join(actionDirectory, 'action.yml'),
        'runs:\n  using: composite\n  steps:\n    - run: npm run deploy:functions\n',
      );

      expect(validateWorkflowFiles(repositoryRoot, [
        '.github/workflows/deploy.yml',
      ])).toEqual([
        {
          rule: 'Repository API deployment script',
          workflow: '.github/actions/publish-functions/action.yml',
        },
      ]);
    } finally {
      rmSync(repositoryRoot, { recursive: true, force: true });
    }
  });
});
