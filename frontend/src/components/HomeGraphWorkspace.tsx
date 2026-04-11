import { useAppStore } from '../store/appStore';
import { HomeInstanceGraph } from './HomeInstanceGraph';
import { Neo4jQueryPanel } from './Neo4jQueryPanel';
import { OntologyGraph } from './OntologyGraph';

export function HomeGraphWorkspace() {
  const languageMode = useAppStore((state) => state.languageMode);
  const graphViewMode = useAppStore((state) => state.graphViewMode);
  const setGraphViewMode = useAppStore((state) => state.setGraphViewMode);
  const labels =
    languageMode === 'ko'
      ? {
          schema: '스키마',
          graph: '그래프',
          query: '질의',
        }
      : {
          schema: 'Schema',
          graph: 'Graph',
          query: 'Query',
        };

  return (
    <section className="home-graph-workspace">
      <div className="home-graph-tabs">
        <button
          type="button"
          className={`designer-tab ${graphViewMode === 'schema' ? 'active' : ''}`}
          onClick={() => setGraphViewMode('schema')}
        >
          {labels.schema}
        </button>
        <button
          type="button"
          className={`designer-tab ${graphViewMode === 'instance' ? 'active' : ''}`}
          onClick={() => setGraphViewMode('instance')}
        >
          {labels.graph}
        </button>
        <button
          type="button"
          className={`designer-tab ${graphViewMode === 'query' ? 'active' : ''}`}
          onClick={() => setGraphViewMode('query')}
        >
          {labels.query}
        </button>
      </div>

      <div className="home-graph-body">
        {graphViewMode === 'schema' ? (
          <OntologyGraph />
        ) : graphViewMode === 'instance' ? (
          <HomeInstanceGraph />
        ) : (
          <Neo4jQueryPanel />
        )}
      </div>
    </section>
  );
}
