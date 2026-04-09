import { useAppStore } from '../store/appStore';
import { useAlignmentStore } from '../store/alignmentStore';
import { AlignmentWorkspace } from './alignment/AlignmentWorkspace';
import { InstanceGraphPanel } from './InstanceGraphPanel';

export function ReviewGraphWorkbench() {
  const currentOntology = useAppStore((state) => state.currentOntology);
  const workspaceTab = useAppStore((state) => state.workspaceTab);
  const setWorkspaceTab = useAppStore((state) => state.setWorkspaceTab);
  const approvedFacts = useAlignmentStore((state) => state.approvedFacts);
  const queue = useAlignmentStore((state) => state.queue);

  return (
    <section className="review-graph-workbench">
      <div className="workbench-overview">
        <div>
          <p className="alignment-kicker">Ontology Overview</p>
          <h2>{currentOntology.name}</h2>
          <p>{currentOntology.description || 'Current ontology draft loaded from the designer.'}</p>
        </div>
        <div className="workbench-overview-stats">
          <span>{currentOntology.entityTypes.length} classes</span>
          <span>{currentOntology.relationships.length} relations</span>
          <span>{queue.length} review candidates</span>
          <span>{approvedFacts.length} approved facts</span>
        </div>
      </div>

      <div className="workbench-tabs">
        <button
          type="button"
          className={`designer-tab ${workspaceTab === 'review' ? 'active' : ''}`}
          onClick={() => setWorkspaceTab('review')}
        >
          Review
        </button>
        <button
          type="button"
          className={`designer-tab ${workspaceTab === 'approved-graph' ? 'active' : ''}`}
          onClick={() => setWorkspaceTab('approved-graph')}
        >
          Graph
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
