import type { GraphProjection, MappingSelection, SchemaSummary } from '../../types/alignment';

interface SchemaPaneProps {
  schema: SchemaSummary | null;
  graph: GraphProjection | null;
  mappingSelection: MappingSelection;
  onSelectMapping: (field: keyof MappingSelection, value: string | null) => void;
}

export function SchemaPane({
  schema,
  graph,
  mappingSelection,
  onSelectMapping,
}: SchemaPaneProps) {
  return (
    <aside className="alignment-pane alignment-schema-pane">
      {!schema ? (
        <section className="alignment-schema-list">
          <article className="alignment-schema-card">
            <strong>Schema Pending</strong>
            <p>Run extraction from the left panel to load the normalized schema and review mappings.</p>
          </article>
        </section>
      ) : (
        <>
      <div className="alignment-pane-header">
        <p className="alignment-kicker">Published Schema</p>
        <h2>{schema.name}</h2>
        <p>{schema.description}</p>
      </div>

      <div className="alignment-mapping-section">
        <label htmlFor="subject-class">Subject Class</label>
        <select
          id="subject-class"
          value={mappingSelection.subjectClassId ?? ''}
          onChange={(event) => onSelectMapping('subjectClassId', event.target.value || null)}
        >
          <option value="">Select class</option>
          {schema.classes.map((item) => (
            <option key={item.class_id} value={item.class_id}>
              {item.name}
            </option>
          ))}
        </select>
      </div>

      <div className="alignment-mapping-section">
        <label htmlFor="relation-type">Relation</label>
        <select
          id="relation-type"
          value={mappingSelection.relationId ?? ''}
          onChange={(event) => onSelectMapping('relationId', event.target.value || null)}
        >
          <option value="">Select relation</option>
          {schema.relations.map((item) => (
            <option key={item.relation_id} value={item.relation_id}>
              {item.name}
            </option>
          ))}
        </select>
      </div>

      <div className="alignment-mapping-section">
        <label htmlFor="object-class">Object Class</label>
        <select
          id="object-class"
          value={mappingSelection.objectClassId ?? ''}
          onChange={(event) => onSelectMapping('objectClassId', event.target.value || null)}
        >
          <option value="">Select class</option>
          {schema.classes.map((item) => (
            <option key={item.class_id} value={item.class_id}>
              {item.name}
            </option>
          ))}
        </select>
      </div>

      <div className="alignment-schema-list">
        {schema.classes.map((item) => (
          <article key={item.class_id} className="alignment-schema-card">
            <div className="alignment-schema-card-header">
              <strong>{item.name}</strong>
              <span>{item.property_names.length} props</span>
            </div>
            <p>{item.description}</p>
            <div className="alignment-chip-row">
              {item.aliases.map((alias) => (
                <span key={alias} className="alignment-chip">
                  {alias}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>

      {graph ? (
        <section className="alignment-schema-list">
          <article className="alignment-schema-card">
            <div className="alignment-schema-card-header">
              <strong>Generated Graph</strong>
              <span>
                {graph.nodes.length} nodes · {graph.relationships.length} edges
              </span>
            </div>
            <p>The current draft ontology has been projected into a reviewable graph payload.</p>
            <div className="alignment-chip-row">
              {graph.relationships.slice(0, 6).map((relationship) => (
                <span key={relationship.relationship_id} className="alignment-chip">
                  {relationship.source_node_id} → {relationship.type} → {relationship.target_node_id}
                </span>
              ))}
            </div>
          </article>
        </section>
      ) : null}
        </>
      )}
    </aside>
  );
}
