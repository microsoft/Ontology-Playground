import { describe, expect, it } from 'vitest';
import { isFactualEvidence, rankResearchArtifacts, sourcePriorityFor } from './researchRouting';

describe('researchRouting', () => {
  it('prioritizes Slack for internal, current-conversation requests', () => {
    expect(sourcePriorityFor('社内で会話されている最新動向を知りたい').slice(0, 2)).toEqual(['Slack', 'Notion']);
  });

  it('resolves a registered internal alias before using general source signals', () => {
    expect(sourcePriorityFor('AISの最新の取り組みについて')[0]).toBe('Slack');
    expect(sourcePriorityFor('AIストラテジー推進部の動向を教えて')[0]).toBe('Slack');
  });

  it('prioritizes an implementation tracker for unresolved work', () => {
    expect(sourcePriorityFor('未解決Issueの担当と期限を確認したい')[0]).toBe('GitHub');
  });

  it('keeps demo artifacts discoverable but not factual', () => {
    const ranked = rankResearchArtifacts('社内の最新状況', [
      { id: 'official', platform: 'Official', status: 'published', publishedAt: '2026-08-01T10:00:00+09:00' },
      { id: 'slack', platform: 'Slack', status: 'fictional-demo', publishedAt: '2026-08-01T09:00:00+09:00' },
    ]);
    expect(ranked[0].id).toBe('slack');
    expect(isFactualEvidence(ranked[0])).toBe(false);
  });
});
