export type SchemaStatus = 'DRAFT' | 'PUBLISHED' | 'DEPRECATED';

export type QueueCandidateStatus =
  | 'NEW'
  | 'IN_REVIEW'
  | 'APPROVED_STAGED'
  | 'REJECTED'
  | 'DEFERRED'
  | 'REREVIEW_REQUIRED';

export type ReviewPriority = 'LOW' | 'NORMAL' | 'HIGH';

export type ReviewAction = 'APPROVE' | 'REJECT' | 'DEFER';

export interface SchemaClassSummary {
  class_id: string;
  name: string;
  aliases: string[];
  description: string;
  property_names: string[];
}

export interface SchemaRelationSummary {
  relation_id: string;
  name: string;
  aliases: string[];
  domain_class_id: string;
  range_class_id: string;
}

export interface SchemaSummary {
  schema_version_id: string;
  version: number;
  status: SchemaStatus;
  name: string;
  description: string;
  published_at?: string;
  classes: SchemaClassSummary[];
  relations: SchemaRelationSummary[];
}

export interface SuggestionItem {
  target_id: string;
  target_name: string;
  score: number;
  reasons: string[];
}

export interface CandidateSuggestions {
  subject: SuggestionItem[];
  relation: SuggestionItem[];
  object: SuggestionItem[];
}

export interface RawExtractionNode {
  label: string;
  properties: Record<string, string | number | boolean | null>;
}

export interface RawExtractionRelation {
  type: string;
  properties: Record<string, string | number | boolean | null>;
}

export interface RawExtractionPreview {
  subject: RawExtractionNode;
  relation: RawExtractionRelation;
  object: RawExtractionNode;
}

export interface CandidateLock {
  locked_by: string;
  locked_at: string;
  expires_at: string;
}

export interface QueueCandidate {
  candidate_id: string;
  status: QueueCandidateStatus;
  schema_version_id: string;
  source_doc_id: string;
  source_doc_name: string;
  doc_type: string;
  page: number;
  source_snippet: string;
  subject_text: string;
  relation_text: string;
  object_text: string;
  extraction_run_id: string;
  extraction_confidence: number;
  review_priority: ReviewPriority;
  assigned_reviewer_id: string | null;
  lock: CandidateLock | null;
  suggestions: CandidateSuggestions;
  raw_extraction?: RawExtractionPreview | null;
}

export interface QueuePageResponse {
  items: QueueCandidate[];
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
  active_schema_version_id: string;
}

export interface CandidateLockRequest {
  reviewer_id: string;
  lock_timeout_seconds: number;
}

export interface CandidateLockResponse {
  candidate_id: string;
  status: QueueCandidateStatus;
  lock: CandidateLock;
}

export interface ReviewDecisionRequest {
  candidate_id: string;
  schema_version_id: string;
  reviewer_id: string;
  action: ReviewAction;
  mapped_subject_class_id: string | null;
  mapped_relation_id: string | null;
  mapped_object_class_id: string | null;
  reason_code: string;
  comment: string | null;
  idempotency_key: string;
}

export interface ReviewDecisionResponse {
  review_decision_id: string;
  candidate_id: string;
  status: QueueCandidateStatus;
  staging_fact_id: string | null;
  schema_version_id: string;
  reviewed_at: string;
  next_candidate_id: string | null;
}

export interface SchemaDraftSaveRequest {
  base_schema_version_id: string;
  editor_id: string;
  name: string;
  description: string;
  classes: SchemaClassSummary[];
  relations: SchemaRelationSummary[];
}

export interface SchemaDraftSaveResponse {
  schema_version_id: string;
  version: number;
  status: SchemaStatus;
  base_schema_version_id: string;
  saved_at: string;
}

export interface OntologyPropertyInput {
  name: string;
  type: string;
  isIdentifier?: boolean;
  unit?: string;
  values?: string[];
  description?: string;
}

export interface OntologyRelationshipAttributeInput {
  name: string;
  type: string;
}

export interface OntologyEntityInput {
  id: string;
  name: string;
  description: string;
  properties: OntologyPropertyInput[];
  icon: string;
  color: string;
}

export interface OntologyRelationshipInput {
  id: string;
  name: string;
  from: string;
  to: string;
  cardinality: string;
  description?: string;
  attributes?: OntologyRelationshipAttributeInput[];
}

export interface OntologyInput {
  name: string;
  description: string;
  entityTypes: OntologyEntityInput[];
  relationships: OntologyRelationshipInput[];
}

export interface SourceDocumentInput {
  source_doc_id?: string | null;
  source_doc_name: string;
  doc_type: string;
  page?: number;
  text: string;
}

export interface GraphProjectionNode {
  node_id: string;
  label: string;
  entity_type_id: string;
  properties: Record<string, string | number | boolean | null>;
  color: string;
}

export interface GraphProjectionRelationship {
  relationship_id: string;
  source_node_id: string;
  target_node_id: string;
  type: string;
  cardinality: string;
  properties: Record<string, string | number | boolean | null>;
}

export interface GraphProjection {
  nodes: GraphProjectionNode[];
  relationships: GraphProjectionRelationship[];
}

export interface OntologyGraphBuildRequest {
  editor_id: string;
  ontology: OntologyInput;
  source_documents?: SourceDocumentInput[];
  extraction_prompt_override?: string | null;
  llm_provider_override?: 'auto' | 'openai' | 'azure_openai' | null;
}

export interface OntologyGraphBuildResponse {
  extraction_run_id: string;
  generated_at: string;
  schema: SchemaSummary;
  queue: QueuePageResponse;
  graph: GraphProjection;
  source_documents_used: number;
}

export interface MappingSelection {
  subjectClassId: string | null;
  relationId: string | null;
  objectClassId: string | null;
}

export interface ReviewSubmission extends MappingSelection {
  action: ReviewAction;
  reasonCode: string;
  comment: string | null;
}

export interface ErrorResponse {
  error_code: string;
  message: string;
  details?: Record<string, string>;
}

export interface ApprovedFactNode {
  text: string;
  class_id: string;
}

export interface ApprovedFactRelation {
  text: string;
  relation_id: string;
}

export interface ApprovedFact {
  staging_fact_id: string;
  review_decision_id: string;
  candidate_id: string;
  schema_version_id: string;
  subject: ApprovedFactNode;
  relation: ApprovedFactRelation;
  object: ApprovedFactNode;
  status: string;
  created_at: string;
}

export interface ApprovedFactsResponse {
  items: ApprovedFact[];
  total_items: number;
}

export interface InstanceGraphNode {
  node_id: string;
  label: string;
  class_id: string;
  properties: Record<string, string | number | boolean | null>;
}

export interface InstanceGraphEdge {
  edge_id: string;
  source_node_id: string;
  target_node_id: string;
  relation_id: string;
  label: string;
  properties: Record<string, string | number | boolean | null>;
}

export interface InstanceGraphResponse {
  nodes: InstanceGraphNode[];
  edges: InstanceGraphEdge[];
  total_facts: number;
}
