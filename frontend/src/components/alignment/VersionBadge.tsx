import type { SchemaSummary } from '../../types/alignment';

interface VersionBadgeProps {
  schema: SchemaSummary | null;
}

export function VersionBadge({ schema }: VersionBadgeProps) {
  if (!schema) return null;

  return (
    <div className="alignment-version-badge">
      <span className="alignment-version-label">Schema</span>
      <strong>v{schema.version}</strong>
      <span className={`alignment-version-status is-${schema.status.toLowerCase()}`}>
        {schema.status}
      </span>
    </div>
  );
}
