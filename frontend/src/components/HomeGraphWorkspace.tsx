import { useAppStore } from '../store/appStore';
import { HomeInstanceGraph } from './HomeInstanceGraph';
import { Neo4jQueryPanel } from './Neo4jQueryPanel';
import { OntologyGraph } from './OntologyGraph';

export function HomeGraphWorkspace() {
  const graphViewMode = useAppStore((state) => state.graphViewMode);
  const setGraphViewMode = useAppStore((state) => state.setGraphViewMode);

  return (
    <section className="home-graph-workspace">
      <div className="home-graph-tabs">
        <button
          type="button"
          className={`designer-tab ${graphViewMode === 'schema' ? 'active' : ''}`}
          onClick={() => setGraphViewMode('schema')}
        >
          Schema
        </button>
        <button
          type="button"
          className={`designer-tab ${graphViewMode === 'instance' ? 'active' : ''}`}
          onClick={() => setGraphViewMode('instance')}
        >
          Graph
        </button>
        <button
          type="button"
          className={`designer-tab ${graphViewMode === 'query' ? 'active' : ''}`}
          onClick={() => setGraphViewMode('query')}
        >
          Query
        </button>
      </div>

      <div className="home-graph-body">
        {graphViewMode === 'schema' ? <OntologyGraph /> : graphViewMode === 'instance' ? <HomeInstanceGraph /> : <Neo4jQueryPanel />}
      </div>
    </section>
  );
}
