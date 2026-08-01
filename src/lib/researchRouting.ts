export type ResearchSource = 'Slack' | 'Notion' | 'GitHub' | 'Official';

export interface ResearchArtifact {
  id: string;
  platform: string;
  status: string;
  publishedAt: string;
}

/** A stable internal alias and the source route defined for it in the ontology. */
export interface InternalResearchRoute {
  aliases: readonly string[];
  source: ResearchSource;
}

/**
 * Known internal terms must be resolved before general-language signals.
 * This prevents an ambiguous acronym from being sent to an external source
 * merely because the request omits words such as "社内".
 */
export const INTERNAL_RESEARCH_ROUTES: readonly InternalResearchRoute[] = [
  {
    aliases: ['AIストラテジー推進部', 'AIS'],
    source: 'Slack',
  },
];

const SIGNALS: ReadonlyArray<readonly [ResearchSource, readonly string[]]> = [
  ['Slack', ['社内', '会話', '温度感', '最新動向', 'いま', '現場']],
  ['Notion', ['方針', '決定', '設計', '背景', '議事録']],
  ['GitHub', ['実装', '担当', '未解決', '期限', 'issue', '課題']],
  ['Official', ['公式', '組織図', '発表', '制度', '対外']],
];

/**
 * Turns a natural-language research request into a source traversal order.
 * The order guides discovery only; it never upgrades an artifact's confidence.
 */
export function sourcePriorityFor(
  question: string,
  internalRoutes: readonly InternalResearchRoute[] = INTERNAL_RESEARCH_ROUTES,
): ResearchSource[] {
  const normalized = question.toLocaleLowerCase('ja-JP');
  const internalMatches = internalRoutes
    .filter(route => route.aliases.some(alias => normalized.includes(alias.toLocaleLowerCase('ja-JP'))))
    .map(route => route.source);
  const matches: ResearchSource[] = SIGNALS
    .filter(([, signals]) => signals.some(signal => normalized.includes(signal)))
    .map(([source]) => source as ResearchSource);
  return [...new Set<ResearchSource>([...internalMatches, ...matches, 'Slack', 'Notion', 'GitHub', 'Official'])];
}

export function rankResearchArtifacts(question: string, artifacts: ResearchArtifact[]): ResearchArtifact[] {
  const priority = sourcePriorityFor(question);
  return [...artifacts].sort((left, right) => {
    const sourceDifference = priority.indexOf(left.platform as ResearchSource) - priority.indexOf(right.platform as ResearchSource);
    if (sourceDifference !== 0) return sourceDifference;
    return right.publishedAt.localeCompare(left.publishedAt);
  });
}

/** Demo and unverified sources are discoverable but must be labelled as such. */
export function isFactualEvidence(artifact: Pick<ResearchArtifact, 'status'>): boolean {
  return artifact.status !== 'fictional-demo' && artifact.status !== 'unverified';
}
