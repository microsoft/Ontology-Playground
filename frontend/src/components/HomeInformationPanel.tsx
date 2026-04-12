import { Info } from 'lucide-react';
import { useAppStore } from '../store/appStore';

const COPY = {
  en: {
    kicker: 'Information',
    title: 'Workspace Guide',
    intro:
      'Use this section as a quick guide for what Oh-tology is good at and how to move through the main workflow.',
    sections: [
      {
        title: 'When to use it',
        items: [
          'When you need to design an ontology and immediately validate it against extracted real-world facts.',
          'When you want a local workflow from draft schema to approved instance graph and Neo4j query.',
          'When domain experts and graph engineers need one shared surface for schema, review, and query work.',
        ],
      },
      {
        title: 'Recommended flow',
        items: [
          'Start in Schema to inspect or refine the ontology model.',
          'Use Settings to choose the default LLM provider and language.',
          'Generate or review extraction results, then approve facts into the graph.',
          'Open Graph to inspect the approved instance graph.',
          'Use Query to run Cypher or translate natural language into Cypher.',
        ],
      },
      {
        title: 'Important notes',
        items: [
          'Ontology schema and live Neo4j data can diverge; query translation works best when the graph has been republished recently.',
          'AI-assisted features depend on the configured OpenAI or Azure OpenAI credentials.',
          'The local library under frontend/library stores ontology and graph snapshots for iteration and version control.',
        ],
      },
    ],
  },
  ko: {
    kicker: 'Information',
    title: '워크스페이스 가이드',
    intro:
      '이 섹션은 Oh-tology를 언제 쓰면 좋은지, 그리고 어떤 순서로 사용하는 것이 좋은지 빠르게 안내합니다.',
    sections: [
      {
        title: '언제 쓰면 좋은가',
        items: [
          '온톨로지를 설계하고, 그 구조를 실제 추출 fact와 바로 대조해 검증해야 할 때',
          '초안 스키마부터 승인된 인스턴스 그래프, Neo4j 질의까지 한 흐름으로 이어가고 싶을 때',
          '도메인 전문가와 그래프 엔지니어가 하나의 화면에서 스키마, 리뷰, 질의를 함께 다뤄야 할 때',
        ],
      },
      {
        title: '권장 사용 흐름',
        items: [
          'Schema 탭에서 온톨로지 구조를 확인하거나 수정합니다.',
          'Settings 탭에서 기본 LLM provider와 언어를 설정합니다.',
          '추출 결과를 생성하거나 리뷰한 뒤 fact를 승인해 그래프를 만듭니다.',
          'Graph 탭에서 승인된 인스턴스 그래프를 확인합니다.',
          'Query 탭에서 Cypher를 직접 실행하거나 자연어를 Cypher로 번역합니다.',
        ],
      },
      {
        title: '알아둘 점',
        items: [
          '온톨로지 정의와 실제 Neo4j 데이터 구조가 다를 수 있으므로, 최근에 republish한 그래프일수록 질의 번역 정확도가 높습니다.',
          'AI 기능은 OpenAI 또는 Azure OpenAI 자격증명이 설정되어 있어야 동작합니다.',
          'frontend/library 아래의 로컬 라이브러리는 온톨로지와 그래프 스냅샷을 저장해 반복 작업과 버전 관리를 돕습니다.',
        ],
      },
    ],
  },
} as const;

export function HomeInformationPanel() {
  const languageMode = useAppStore((state) => state.languageMode);
  const copy = COPY[languageMode];
  const badges =
    languageMode === 'ko'
      ? ['Schema authoring', 'Draft generation', 'Extraction review', 'Instance graph', 'Cypher query']
      : ['Schema authoring', 'Draft generation', 'Extraction review', 'Instance graph', 'Cypher query'];

  return (
    <section className="home-settings-panel">
      <div className="home-settings-header">
        <div>
          <p className="alignment-kicker">{copy.kicker}</p>
          <h2>{copy.title}</h2>
          <p className="home-settings-copy">{copy.intro}</p>
        </div>
        <div className="home-settings-icon">
          <Info size={22} />
        </div>
      </div>

      <div className="information-hero-card">
        <div className="information-hero-copy">
          <h3>{languageMode === 'ko' ? '한 화면에서 끝나는 그래프 워크플로우' : 'A graph workflow that closes the loop'}</h3>
          <p>
            {languageMode === 'ko'
              ? 'Oh-tology는 초안 생성, 스키마 설계, extraction review, 승인된 그래프, Neo4j 질의까지 하나의 로컬 워크스페이스에서 이어집니다.'
              : 'Oh-tology connects draft generation, schema design, extraction review, approved graph curation, and Neo4j querying inside one local workspace.'}
          </p>
        </div>
        <div className="information-badge-row">
          {badges.map((badge) => (
            <span key={badge} className="alignment-chip">{badge}</span>
          ))}
        </div>
      </div>

      <div className="information-grid">
        {copy.sections.map((section, index) => (
          <div key={section.title} className="home-settings-card information-card">
            <div className="information-card-header">
              <span className="information-card-index">0{index + 1}</span>
              <h3>{section.title}</h3>
            </div>
            <ul className="home-settings-list">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
