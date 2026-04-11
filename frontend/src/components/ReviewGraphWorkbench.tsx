import { useAppStore } from '../store/appStore';
import { useAlignmentStore } from '../store/alignmentStore';
import { AlignmentWorkspace } from './alignment/AlignmentWorkspace';
import { InstanceGraphPanel } from './InstanceGraphPanel';

export function ReviewGraphWorkbench() {
  const currentOntology = useAppStore((state) => state.currentOntology);
  const languageMode = useAppStore((state) => state.languageMode);
  const workspaceTab = useAppStore((state) => state.workspaceTab);
  const setWorkspaceTab = useAppStore((state) => state.setWorkspaceTab);
  const approvedFacts = useAlignmentStore((state) => state.approvedFacts);
  const queue = useAlignmentStore((state) => state.queue);
  const copy =
    languageMode === 'ko'
      ? {
          kicker: '온톨로지 개요',
          empty: '디자이너에서 불러온 현재 온톨로지 초안입니다.',
          classes: '클래스',
          relations: '관계',
          candidates: '리뷰 후보',
          facts: '승인된 팩트',
          review: '리뷰',
          graph: '그래프',
        }
      : {
          kicker: 'Ontology Overview',
          empty: 'Current ontology draft loaded from the designer.',
          classes: 'classes',
          relations: 'relations',
          candidates: 'review candidates',
          facts: 'approved facts',
          review: 'Review',
          graph: 'Graph',
        };

  return (
    <section className="review-graph-workbench">
      <div className="workbench-overview">
        <div>
          <p className="alignment-kicker">{copy.kicker}</p>
          <h2>{currentOntology.name}</h2>
          <p>{currentOntology.description || copy.empty}</p>
        </div>
        <div className="workbench-overview-stats">
          <span>{currentOntology.entityTypes.length} {copy.classes}</span>
          <span>{currentOntology.relationships.length} {copy.relations}</span>
          <span>{queue.length} {copy.candidates}</span>
          <span>{approvedFacts.length} {copy.facts}</span>
        </div>
      </div>

      <div className="workbench-tabs">
        <button
          type="button"
          className={`designer-tab ${workspaceTab === 'review' ? 'active' : ''}`}
          onClick={() => setWorkspaceTab('review')}
        >
          {copy.review}
        </button>
        <button
          type="button"
          className={`designer-tab ${workspaceTab === 'approved-graph' ? 'active' : ''}`}
          onClick={() => setWorkspaceTab('approved-graph')}
        >
          {copy.graph}
        </button>
      </div>

      <div className="workbench-body is-single-column">
        <div className="workbench-primary">
          {workspaceTab === 'review' ? <AlignmentWorkspace embedded /> : <InstanceGraphPanel />}
        </div>
      </div>
    </section>
  );
}
