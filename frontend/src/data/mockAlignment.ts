import type {
  QueueCandidate,
  QueuePageResponse,
  ReviewDecisionRequest,
  ReviewDecisionResponse,
  SchemaSummary,
  SourceDocumentInput,
} from '../types/alignment';

export const mockSchemaSummary: SchemaSummary = {
  schema_version_id: 'schema_v1',
  version: 1,
  status: 'PUBLISHED',
  name: 'Refinery Maintenance Ontology',
  description: 'Published schema used for Phase 1 maintenance review alignment',
  published_at: '2026-04-08T01:00:00Z',
  classes: [
    {
      class_id: 'class_worker',
      name: 'Worker',
      aliases: ['Engineer', 'Technician', 'Operator'],
      description: 'A human actor who performs or supervises maintenance work.',
      property_names: ['worker_id', 'name', 'role'],
    },
    {
      class_id: 'class_equipment',
      name: 'Equipment',
      aliases: ['Pump', 'Valve', 'Compressor', 'Motor'],
      description: 'A physical asset used in plant operations.',
      property_names: ['asset_tag', 'name', 'equipment_type'],
    },
    {
      class_id: 'class_failure_cause',
      name: 'FailureCause',
      aliases: ['Fault Cause', 'Failure Reason', 'Damage Cause'],
      description: 'A cause or explanation for an equipment issue.',
      property_names: ['code', 'label'],
    },
    {
      class_id: 'class_maintenance_event',
      name: 'MaintenanceEvent',
      aliases: ['Repair Event', 'Inspection Event'],
      description: 'A maintenance action event tied to time, actor, and equipment.',
      property_names: ['event_time', 'work_order_id'],
    },
  ],
  relations: [
    {
      relation_id: 'rel_repaired',
      name: 'REPAIRED',
      aliases: ['수리함', '정비함'],
      domain_class_id: 'class_worker',
      range_class_id: 'class_equipment',
    },
    {
      relation_id: 'rel_inspected',
      name: 'INSPECTED',
      aliases: ['점검함', '검사함'],
      domain_class_id: 'class_worker',
      range_class_id: 'class_equipment',
    },
    {
      relation_id: 'rel_caused_by',
      name: 'CAUSED_BY',
      aliases: ['원인은', '기인함'],
      domain_class_id: 'class_equipment',
      range_class_id: 'class_failure_cause',
    },
  ],
};

export const mockQueueCandidates: QueueCandidate[] = [
  {
    candidate_id: 'cand_0001',
    status: 'NEW',
    schema_version_id: 'schema_v1',
    source_doc_id: 'maint_log_251024_pdf',
    source_doc_name: '정비일지_251024.pdf',
    doc_type: 'maintenance_log',
    page: 14,
    source_snippet: '김엔지니어가 V-101 펌프를 분해 점검 후 베어링 손상으로 판단하여 수리함.',
    subject_text: '김엔지니어',
    relation_text: '수리함',
    object_text: 'V-101 펌프',
    extraction_run_id: 'extract_run_20260408_001',
    extraction_confidence: 0.81,
    review_priority: 'NORMAL',
    assigned_reviewer_id: null,
    lock: null,
    suggestions: {
      subject: [
        {
          target_id: 'class_worker',
          target_name: 'Worker',
          score: 0.93,
          reasons: ['alias_match: engineer', 'person-title pattern'],
        },
      ],
      relation: [
        {
          target_id: 'rel_repaired',
          target_name: 'REPAIRED',
          score: 0.91,
          reasons: ['alias_match: 수리함'],
        },
      ],
      object: [
        {
          target_id: 'class_equipment',
          target_name: 'Equipment',
          score: 0.96,
          reasons: ['asset-tag pattern: V-101', 'equipment alias match: pump'],
        },
      ],
    },
  },
  {
    candidate_id: 'cand_0002',
    status: 'NEW',
    schema_version_id: 'schema_v1',
    source_doc_id: 'maint_log_251024_pdf',
    source_doc_name: '정비일지_251024.pdf',
    doc_type: 'maintenance_log',
    page: 15,
    source_snippet: '오퍼레이터 박씨가 P-220 모터 진동을 확인하고 추가 점검을 요청함.',
    subject_text: '오퍼레이터 박씨',
    relation_text: '점검함',
    object_text: 'P-220 모터',
    extraction_run_id: 'extract_run_20260408_001',
    extraction_confidence: 0.77,
    review_priority: 'NORMAL',
    assigned_reviewer_id: null,
    lock: null,
    suggestions: {
      subject: [
        {
          target_id: 'class_worker',
          target_name: 'Worker',
          score: 0.88,
          reasons: ['role-title overlap'],
        },
      ],
      relation: [
        {
          target_id: 'rel_inspected',
          target_name: 'INSPECTED',
          score: 0.86,
          reasons: ['alias_match: 점검함'],
        },
      ],
      object: [
        {
          target_id: 'class_equipment',
          target_name: 'Equipment',
          score: 0.94,
          reasons: ['asset-tag pattern: P-220'],
        },
      ],
    },
  },
  {
    candidate_id: 'cand_0003',
    status: 'NEW',
    schema_version_id: 'schema_v1',
    source_doc_id: 'failure_report_251026_pdf',
    source_doc_name: '고장보고서_251026.pdf',
    doc_type: 'failure_report',
    page: 4,
    source_snippet: 'V-101 펌프의 반복 정지는 윤활 부족에 기인한 것으로 분석됨.',
    subject_text: 'V-101 펌프',
    relation_text: '기인함',
    object_text: '윤활 부족',
    extraction_run_id: 'extract_run_20260408_002',
    extraction_confidence: 0.84,
    review_priority: 'HIGH',
    assigned_reviewer_id: null,
    lock: null,
    suggestions: {
      subject: [
        {
          target_id: 'class_equipment',
          target_name: 'Equipment',
          score: 0.95,
          reasons: ['asset-tag pattern: V-101'],
        },
      ],
      relation: [
        {
          target_id: 'rel_caused_by',
          target_name: 'CAUSED_BY',
          score: 0.82,
          reasons: ['alias_match: 기인함'],
        },
      ],
      object: [
        {
          target_id: 'class_failure_cause',
          target_name: 'FailureCause',
          score: 0.79,
          reasons: ['cause lexicon overlap'],
        },
      ],
    },
  },
  {
    candidate_id: 'cand_0004',
    status: 'NEW',
    schema_version_id: 'schema_v1',
    source_doc_id: 'pandid_note_251027_pdf',
    source_doc_name: 'P&ID_메모_251027.pdf',
    doc_type: 'pandid_note',
    page: 2,
    source_snippet: '라인 주변 소음 증가. V-303 밸브 교체 필요 추정.',
    subject_text: '라인 주변 소음',
    relation_text: '교체 필요',
    object_text: 'V-303 밸브',
    extraction_run_id: 'extract_run_20260408_003',
    extraction_confidence: 0.58,
    review_priority: 'HIGH',
    assigned_reviewer_id: null,
    lock: null,
    suggestions: {
      subject: [
        {
          target_id: 'class_failure_cause',
          target_name: 'FailureCause',
          score: 0.42,
          reasons: ['symptom vocabulary overlap'],
        },
      ],
      relation: [
        {
          target_id: 'rel_repaired',
          target_name: 'REPAIRED',
          score: 0.33,
          reasons: ['maintenance-action overlap'],
        },
      ],
      object: [
        {
          target_id: 'class_equipment',
          target_name: 'Equipment',
          score: 0.92,
          reasons: ['asset-tag pattern: V-303'],
        },
      ],
    },
  },
  {
    candidate_id: 'cand_0005',
    status: 'NEW',
    schema_version_id: 'schema_v1',
    source_doc_id: 'maint_log_251028_pdf',
    source_doc_name: '정비일지_251028.pdf',
    doc_type: 'maintenance_log',
    page: 9,
    source_snippet: '정비반이 C-12 압축기 점검을 완료하고 추가 이상 없음으로 기록함.',
    subject_text: '정비반',
    relation_text: '점검함',
    object_text: 'C-12 압축기',
    extraction_run_id: 'extract_run_20260408_004',
    extraction_confidence: 0.74,
    review_priority: 'LOW',
    assigned_reviewer_id: null,
    lock: null,
    suggestions: {
      subject: [
        {
          target_id: 'class_worker',
          target_name: 'Worker',
          score: 0.72,
          reasons: ['team-role overlap'],
        },
      ],
      relation: [
        {
          target_id: 'rel_inspected',
          target_name: 'INSPECTED',
          score: 0.89,
          reasons: ['alias_match: 점검함'],
        },
      ],
      object: [
        {
          target_id: 'class_equipment',
          target_name: 'Equipment',
          score: 0.95,
          reasons: ['asset-tag pattern: C-12', 'compressor alias'],
        },
      ],
    },
  },
];

export const defaultSourceDocuments: SourceDocumentInput[] = [
  {
    source_doc_id: 'demo_doc_001',
    source_doc_name: 'maintenance-note-1.txt',
    doc_type: 'maintenance_log',
    page: 1,
    text: 'Technician Kim inspected pump P-101 before restart and recorded no further vibration.',
  },
  {
    source_doc_id: 'demo_doc_002',
    source_doc_name: 'maintenance-note-2.txt',
    doc_type: 'maintenance_log',
    page: 1,
    text: 'Senior technician Lee inspected pump P-205 after shutdown and confirmed stable pressure.',
  },
];

export function buildMockQueuePage(page = 1, pageSize = 20): QueuePageResponse {
  const totalItems = mockQueueCandidates.length;
  return {
    items: mockQueueCandidates.slice((page - 1) * pageSize, page * pageSize),
    page,
    page_size: pageSize,
    total_items: totalItems,
    total_pages: Math.max(1, Math.ceil(totalItems / pageSize)),
    active_schema_version_id: mockSchemaSummary.schema_version_id,
  };
}

export function buildMockReviewResponse(
  request: ReviewDecisionRequest,
  nextCandidateId: string | null,
): ReviewDecisionResponse {
  return {
    review_decision_id: `review_${request.candidate_id}`,
    candidate_id: request.candidate_id,
    status:
      request.action === 'APPROVE'
        ? 'APPROVED_STAGED'
        : request.action === 'REJECT'
          ? 'REJECTED'
          : 'DEFERRED',
    staging_fact_id: request.action === 'APPROVE' ? `staging_${request.candidate_id}` : null,
    schema_version_id: request.schema_version_id,
    reviewed_at: new Date().toISOString(),
    next_candidate_id: nextCandidateId,
  };
}
