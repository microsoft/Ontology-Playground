import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Ontology } from './ontology';
import type { Quest, QuestStep } from './quests';
import { quests as defaultQuests } from './quests';
import { cosmicCoffeeOntology } from './ontology';
import { generateQuestsForOntology } from './questGenerator';

interface CatalogueEntry {
  id: string;
  ontology?: Ontology;
}

interface CatalogueFile {
  entries: CatalogueEntry[];
}

function resolveCataloguePath(): string {
  const candidates = [
    resolve(process.cwd(), 'public/catalogue.json'),
    resolve(process.cwd(), 'build/catalogue.json'),
  ];

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(`No catalogue.json found. Checked: ${candidates.join(', ')}`);
  }

  return found;
}

function validateQuestTargets(quests: Quest[], ontology: Ontology, context: string): string[] {
  const errors: string[] = [];
  const entityById = new Map(ontology.entityTypes.map((entity) => [entity.id, entity]));
  const relationshipIds = new Set(ontology.relationships.map((relationship) => relationship.id));

  quests.forEach((quest) => {
    quest.steps.forEach((step, index) => {
      if (step.targetType === 'entity') {
        if (!step.targetId || !entityById.has(step.targetId)) {
          errors.push(`${context}: ${quest.id}/${step.id} references missing entity target '${step.targetId ?? ''}'`);
        }
        return;
      }

      if (step.targetType === 'relationship') {
        if (!step.targetId || !relationshipIds.has(step.targetId)) {
          errors.push(`${context}: ${quest.id}/${step.id} references missing relationship target '${step.targetId ?? ''}'`);
        }
        return;
      }

      if (step.targetType === 'property') {
        validatePropertyStep(errors, quest.steps, index, step, entityById, context, quest.id);
      }
    });
  });

  return errors;
}

function validatePropertyStep(
  errors: string[],
  steps: QuestStep[],
  stepIndex: number,
  step: QuestStep,
  entityById: Map<string, Ontology['entityTypes'][number]>,
  context: string,
  questId: string
): void {
  if (!step.targetId) {
    errors.push(`${context}: ${questId}/${step.id} has a property target with no targetId`);
    return;
  }

  const previousEntityStep = [...steps]
    .slice(0, stepIndex)
    .reverse()
    .find((candidate) => candidate.targetType === 'entity' && candidate.targetId);

  if (!previousEntityStep?.targetId) {
    errors.push(`${context}: ${questId}/${step.id} has property target '${step.targetId}' but no preceding entity step`);
    return;
  }

  const selectedEntity = entityById.get(previousEntityStep.targetId);
  if (!selectedEntity) {
    errors.push(`${context}: ${questId}/${step.id} preceding entity '${previousEntityStep.targetId}' does not exist`);
    return;
  }

  const hasProperty = selectedEntity.properties.some((property) => property.name === step.targetId);
  if (!hasProperty) {
    errors.push(
      `${context}: ${questId}/${step.id} targets property '${step.targetId}' not found on entity '${selectedEntity.id}'`
    );
  }
}

describe('quest target integrity', () => {
  it('keeps default Fourth Coffee quest targets valid', () => {
    const errors = validateQuestTargets(defaultQuests, cosmicCoffeeOntology, 'default Fourth Coffee quests');
    expect(errors).toEqual([]);
  });

  it('keeps generated quests valid for every catalogue ontology', () => {
    const cataloguePath = resolveCataloguePath();
    const rawCatalogue = readFileSync(cataloguePath, 'utf8');
    const catalogue = JSON.parse(rawCatalogue) as CatalogueFile;

    const allErrors = catalogue.entries.flatMap((entry) => {
      if (!entry.ontology) return [];
      const generatedQuests = generateQuestsForOntology(entry.ontology);
      return validateQuestTargets(generatedQuests, entry.ontology, `catalogue entry ${entry.id}`);
    });

    expect(allErrors).toEqual([]);
  });
});
