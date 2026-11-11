import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface DeploymentRule {
  description: string;
  pattern: RegExp;
}

export interface DeploymentBoundaryViolation {
  rule: string;
  workflow: string;
}

const DEPLOYMENT_RULES: DeploymentRule[] = [
  {
    description: 'Static Web Apps api_location input',
    pattern: /^\s*["']?api_location["']?\s*:/im,
  },
  {
    description: 'Azure Functions deployment action',
    pattern: /^\s*(?:-\s*)?["']?uses["']?\s*:\s*["']?Azure\/functions[^@\s]*@/im,
  },
  {
    description: 'Azure Functions Core Tools publish command',
    pattern: /\bfunc\s+azure\s+functionapp\s+publish\b/i,
  },
  {
    description: 'Azure CLI functionapp command',
    pattern: /\baz\s+functionapp\b/i,
  },
  {
    description: 'Static Web Apps CLI API deployment',
    pattern: /\bswa\s+deploy\b[^\r\n]*--api-(?:location|language)(?:[=\s]|$)/i,
  },
  {
    description: 'Repository API deployment script',
    pattern: /\b(?:npm|pnpm|yarn)\s+(?:run\s+)?(?=[\w:-]*(?:deploy|publish))(?=[\w:-]*(?:api|functions?))[\w:-]+\b/i,
  },
];

const LOCAL_ACTION_PATTERN =
  /^\s*(?:-\s*)?["']?uses["']?\s*:\s*["']?(\.\/[^'"\s#]+)/gim;

export function findDeploymentBoundaryViolations(
  workflow: string,
  content: string,
): DeploymentBoundaryViolation[] {
  const activeContent = content
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n')
    .replace(/\\\s*\n\s*/g, ' ');

  return DEPLOYMENT_RULES
    .filter((rule) => rule.pattern.test(activeContent))
    .map((rule) => ({
      rule: rule.description,
      workflow,
    }));
}

export function findLocalActionReferences(content: string): string[] {
  return Array.from(
    content.matchAll(LOCAL_ACTION_PATTERN),
    (match) => match[1],
  );
}

function resolveLocalAction(
  repositoryRoot: string,
  reference: string,
): string | undefined {
  const referencedPath = resolve(repositoryRoot, reference);
  const relativePath = relative(repositoryRoot, referencedPath);
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    return undefined;
  }

  if (
    (referencedPath.endsWith('.yml') || referencedPath.endsWith('.yaml'))
    && existsSync(referencedPath)
  ) {
    return referencedPath;
  }

  return ['action.yml', 'action.yaml']
    .map((file) => resolve(referencedPath, file))
    .find((file) => existsSync(file));
}

export function validateWorkflowFiles(
  repositoryRoot: string,
  workflowFiles: string[],
): DeploymentBoundaryViolation[] {
  const pending = workflowFiles.map((file) => resolve(repositoryRoot, file));
  const visited = new Set<string>();
  const violations: DeploymentBoundaryViolation[] = [];

  while (pending.length > 0) {
    const file = pending.shift();
    if (!file || visited.has(file)) continue;
    visited.add(file);

    const workflow = relative(repositoryRoot, file);
    const content = readFileSync(file, 'utf8');
    violations.push(...findDeploymentBoundaryViolations(workflow, content));

    for (const reference of findLocalActionReferences(content)) {
      const localAction = resolveLocalAction(repositoryRoot, reference);
      if (!localAction) {
        violations.push({
          rule: `Unresolvable local action: ${reference}`,
          workflow,
        });
        continue;
      }
      pending.push(localAction);
    }
  }

  return violations;
}

function validateDeploymentWorkflows(): void {
  const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
  const workflowDirectory = fileURLToPath(
    new URL('../.github/workflows/', import.meta.url),
  );
  const workflows = readdirSync(workflowDirectory)
    .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
    .sort();
  const violations = validateWorkflowFiles(
    repositoryRoot,
    workflows.map((workflow) => `.github/workflows/${workflow}`),
  );

  if (violations.length > 0) {
    const details = violations
      .map((violation) => `- ${violation.workflow}: ${violation.rule}`)
      .join('\n');
    throw new Error(
      `Repository-provided deployment workflows must remain frontend-only:\n${details}`,
    );
  }

  console.log(
    `Validated ${workflows.length} static-only deployment workflows.`,
  );
}

const executedFile = process.argv[1] ? resolve(process.argv[1]) : '';
if (executedFile === fileURLToPath(import.meta.url)) {
  validateDeploymentWorkflows();
}
