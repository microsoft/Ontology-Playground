import { useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Braces, Search, Settings2, Sparkles } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { useDesignerStore } from '../store/designerStore';
import {
  runNeo4jQuery,
  translateNaturalLanguageQuery,
  type NaturalLanguageCypherResponse,
} from '../lib/queryApi';
import { QuerySystemPromptModal } from './QuerySystemPromptModal';

const DEFAULT_QUERY_TRANSLATION_PROMPT = `Role:
You translate user questions into safe, read-only Cypher for a Neo4j ontology instance graph.

Primary objective:
- Convert natural language into one valid Cypher query.
- Use the ontology schema exactly as provided.
- Favor simple, readable Cypher that an analyst can inspect and run.

Graph contract:
- Nodes in the published graph use the :OntologyInstance label.
- Relationships are stored between those nodes using domain-specific relationship types.
- Common node properties include nodeId, label, classId, ingestRunId, and source.
- Domain properties from the ontology are also stored directly on nodes.

Query rules:
- Return read-only Cypher only. Never write, update, delete, merge, call procedures, or use APOC.
- Prefer MATCH / WHERE / RETURN / ORDER BY / LIMIT.
- Always include LIMIT 25 unless the user explicitly asks for a smaller limit.
- Do not invent entity classes, relationship types, node properties, or relationship properties.
- Use only the exact classIds, node properties, relationship Cypher types, and relationship attributes provided in the schema context.
- Use classId to filter entity classes when possible.
- Use the ontology relationship ids as relationship types after converting non-alphanumeric characters to underscores and uppercasing the result.
- Node label should remain :OntologyInstance unless the schema context explicitly says otherwise.
- Relationship properties such as rank, year, quantity, amount, status, or dates live on the relationship only when the schema context lists them as relationship attributes.
- If the user asks for a concept that is not present in the provided schema context, do not guess. Return a conservative fallback query and explain the mismatch in warnings.
- If the request is ambiguous, produce the best reasonable query and add a warning.
- If the request cannot be grounded in the ontology, return a conservative fallback query and explain why in warnings.

Output rules:
- Return strict JSON with keys: cypher, summary, warnings.
- warnings must be an array of strings.`;

export function Neo4jQueryPanel() {
  const storedOntology = useAppStore((state) => state.currentOntology);
  const draftOntology = useDesignerStore((state) => state.ontology);
  const llmChatMode = useAppStore((state) => state.llmChatMode);
  const currentOntology =
    draftOntology.entityTypes.length > 0 || draftOntology.relationships.length > 0
      ? draftOntology
      : storedOntology;
  const [mode, setMode] = useState<'natural_language' | 'cypher' | 'ingest_run'>('natural_language');
  const [schemaExpanded, setSchemaExpanded] = useState(false);
  const [ingestRunId, setIngestRunId] = useState('');
  const [naturalLanguagePrompt, setNaturalLanguagePrompt] = useState('');
  const [query, setQuery] = useState('MATCH (n:OntologyInstance) RETURN n.nodeId AS nodeId, n.label AS label, n.classId AS classId LIMIT 25');
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_QUERY_TRANSLATION_PROMPT);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [translation, setTranslation] = useState<NaturalLanguageCypherResponse | null>(null);
  const [result, setResult] = useState<{ columns: string[]; rows: Record<string, string>[]; summary: string } | null>(null);

  const schemaSummary = useMemo(
    () => ({
      entities: currentOntology.entityTypes.map((entity) => ({
        id: entity.id,
        name: entity.name,
        properties: entity.properties.map((property) => property.name),
      })),
      relationships: currentOntology.relationships.map((relationship) => ({
        id: relationship.id,
        name: relationship.name,
        from: relationship.from,
        to: relationship.to,
        cypherType: relationship.id.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase(),
        attributes: relationship.attributes?.map((attribute) => `${attribute.name}:${attribute.type}`) ?? [],
      })),
    }),
    [currentOntology],
  );

  const handleRun = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await runNeo4jQuery({
        mode: mode === 'ingest_run' ? 'ingest_run' : 'cypher',
        ingest_run_id: mode === 'ingest_run' ? ingestRunId : undefined,
        query: mode === 'ingest_run' ? undefined : query,
      });
      setResult(response);
    } catch (queryError) {
      const message = queryError instanceof Error ? queryError.message : 'Failed to run the query.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleTranslate = async () => {
    if (!naturalLanguagePrompt.trim()) {
      setError('Enter a natural language question to translate.');
      return;
    }

    setTranslating(true);
    setError(null);
    try {
      const response = await translateNaturalLanguageQuery({
        prompt: naturalLanguagePrompt,
        ontology: currentOntology,
        system_prompt_override: systemPrompt,
        llm_provider_override: llmChatMode,
      });
      setTranslation(response);
      setQuery(response.cypher);
    } catch (translationError) {
      const message = translationError instanceof Error ? translationError.message : 'Failed to translate the natural language query.';
      setError(message);
    } finally {
      setTranslating(false);
    }
  };

  return (
    <section className="neo4j-query-panel">
      <div className="home-graph-tabs">
        <button
          type="button"
          className={`designer-tab ${mode === 'natural_language' ? 'active' : ''}`}
          onClick={() => setMode('natural_language')}
        >
          Natural Language
        </button>
        <button
          type="button"
          className={`designer-tab ${mode === 'cypher' ? 'active' : ''}`}
          onClick={() => setMode('cypher')}
        >
          Cypher
        </button>
        <button
          type="button"
          className={`designer-tab ${mode === 'ingest_run' ? 'active' : ''}`}
          onClick={() => setMode('ingest_run')}
        >
          Ingest Run
        </button>
      </div>

      <div className="neo4j-query-body">
        {mode === 'natural_language' ? (
          <>
            <div className="neo4j-query-schema-card">
              <div className="neo4j-query-schema-header">
                <div>
                  <p className="alignment-kicker">Schema Context</p>
                  <h3>{currentOntology.name}</h3>
                </div>
                <button
                  type="button"
                  className="designer-toolbar-btn"
                  onClick={() => setShowPromptModal(true)}
                >
                  <Settings2 size={14} />
                  Edit Prompt
                </button>
              </div>
              <p className="neo4j-query-schema-copy">
                The translator receives the current ontology classes, properties, and relationships before generating Cypher.
              </p>
              <button
                type="button"
                className="designer-toolbar-btn neo4j-query-expand-btn"
                onClick={() => setSchemaExpanded((value) => !value)}
              >
                {schemaExpanded ? 'Collapse Schema Context' : 'Expand Schema Context'}
              </button>
              {schemaExpanded ? (
                <div className="neo4j-query-schema-grid">
                  <div>
                    <div className="neo4j-query-schema-title">Entities</div>
                    <div className="neo4j-query-schema-list">
                      {schemaSummary.entities.map((entity) => (
                        <div key={entity.id} className="neo4j-query-schema-item">
                          <strong>{entity.name}</strong>
                          <span>{entity.id}</span>
                          <small>{entity.properties.join(', ') || 'no properties'}</small>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="neo4j-query-schema-title">Relationships</div>
                    <div className="neo4j-query-schema-list">
                      {schemaSummary.relationships.map((relationship) => (
                        <div key={relationship.id} className="neo4j-query-schema-item">
                          <strong>{relationship.name}</strong>
                          <span>{relationship.id}</span>
                          <small>{relationship.from} → {relationship.to}</small>
                          <small>Cypher type: {relationship.cypherType}</small>
                          <small>
                            Attributes: {relationship.attributes.length ? relationship.attributes.join(', ') : 'none'}
                          </small>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <textarea
              className="ontology-prompt-modal-input"
              rows={5}
              value={naturalLanguagePrompt}
              onChange={(event) => setNaturalLanguagePrompt(event.target.value)}
              placeholder="Ask a question about the graph in natural language. Example: Show the top 10 customers with the most orders."
            />

            <div className="neo4j-query-actions">
              <button
                type="button"
                className="ontology-copilot-generate"
                disabled={translating}
                onClick={() => {
                  void handleTranslate();
                }}
              >
                <Sparkles size={16} />
                {translating ? 'Translating…' : 'Translate to Cypher'}
              </button>
              <button
                type="button"
                className="alignment-secondary-btn"
                disabled={loading || !query.trim()}
                onClick={() => {
                  void handleRun();
                }}
              >
                <Search size={16} />
                {loading ? 'Running Query…' : 'Run Query'}
              </button>
            </div>

            <div className="neo4j-query-translation-card">
              <div className="neo4j-query-schema-header">
                <div>
                  <p className="alignment-kicker">Translated Cypher</p>
                  <h3>Review Before Running</h3>
                </div>
                {translation ? (
                  <span className="graph-sidebar-subtitle">{translation.summary}</span>
                ) : null}
              </div>
              <textarea
                className="ontology-prompt-modal-input neo4j-query-cypher-output"
                rows={8}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Translated Cypher will appear here."
              />
              {translation?.warnings.length ? (
                <div className="ontology-copilot-notes">
                  <strong>Warnings</strong>
                  <ul>
                    {translation.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </>
        ) : mode === 'ingest_run' ? (
          <input
            className="instance-graph-ingest-input"
            type="text"
            value={ingestRunId}
            onChange={(event) => setIngestRunId(event.target.value)}
            placeholder="Enter ingest_run_id"
          />
        ) : (
          <textarea
            className="ontology-prompt-modal-input"
            rows={8}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        )}

        {mode !== 'natural_language' ? (
          <button type="button" className="ontology-copilot-generate" disabled={loading} onClick={() => { void handleRun(); }}>
            {mode === 'cypher' ? <Braces size={16} /> : <Search size={16} />}
            {loading ? 'Running Query…' : 'Run Query'}
          </button>
        ) : null}

        {error ? <div className="designer-validation-errors ontology-copilot-error">{error}</div> : null}
        {result ? (
          <div className="neo4j-query-results">
            <p className="alignment-kicker">Results</p>
            <p>{result.summary}</p>
            <div className="neo4j-query-table-wrap">
              <table className="neo4j-query-table">
                <thead>
                  <tr>
                    {result.columns.map((column) => (
                      <th key={column}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, index) => (
                    <tr key={index}>
                      {result.columns.map((column) => (
                        <td key={column}>{row[column]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>

      <AnimatePresence>
        {showPromptModal ? (
          <QuerySystemPromptModal
            value={systemPrompt}
            defaultValue={DEFAULT_QUERY_TRANSLATION_PROMPT}
            onChange={setSystemPrompt}
            onClose={() => setShowPromptModal(false)}
          />
        ) : null}
      </AnimatePresence>
    </section>
  );
}
