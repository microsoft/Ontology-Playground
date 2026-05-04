import type { Ontology } from './ontology';
import { processQuery } from './queryEngine';
import type { Quest } from './quests';

export interface QuestQueryValidationIssue {
  questId: string;
  stepId: string;
  instruction: string;
  reason: string;
  query?: string;
  result?: string;
}

const QUOTED_QUERY_RE = /["“]([^"”]+)["”]/;

export function extractQueryFromInstruction(instruction: string): string | null {
  const match = instruction.match(QUOTED_QUERY_RE);
  return match?.[1]?.trim() || null;
}

export function validateQueryQuestSteps(quests: Quest[], ontology: Ontology): QuestQueryValidationIssue[] {
  const issues: QuestQueryValidationIssue[] = [];

  for (const quest of quests) {
    for (const step of quest.steps) {
      if (step.targetType !== 'query') continue;

      const query = extractQueryFromInstruction(step.instruction);
      if (!query) {
        issues.push({
          questId: quest.id,
          stepId: step.id,
          instruction: step.instruction,
          reason: 'Query step does not contain a quoted NL query.',
        });
        continue;
      }

      const response = processQuery(query, ontology);
      const fellBack = response.result.startsWith(`I couldn't interpret`);
      const emptyResult = response.result.trim().length === 0;
      const lacksContext = !response.interpretation && response.highlightEntities.length === 0 && response.highlightRelationships.length === 0;

      if (fellBack || emptyResult || lacksContext) {
        issues.push({
          questId: quest.id,
          stepId: step.id,
          instruction: step.instruction,
          query,
          result: response.result,
          reason: fellBack
            ? 'Query step falls back to the generic uninterpretable-query response.'
            : emptyResult
              ? 'Query step produced an empty result.'
              : 'Query step did not produce ontology-specific interpretation or highlights.',
        });
      }
    }
  }

  return issues;
}
