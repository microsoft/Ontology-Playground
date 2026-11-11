import type { ReactNode } from 'react';
import { Info } from 'lucide-react';

interface SourceFidelityNoteProps {
  children: ReactNode;
  className?: string;
}

export function SourceFidelityNote({
  children,
  className,
}: SourceFidelityNoteProps) {
  return (
    <div
      role="note"
      className={['source-fidelity-note', className].filter(Boolean).join(' ')}
    >
      <Info size={14} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}
