import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useDesignerStore } from '../store/designerStore';

vi.mock('./designer', () => ({
  EntityForm: () => <div>Entity Form</div>,
  RelationshipForm: () => <div>Relationship Form</div>,
  DesignerToolbar: () => <div>Designer Toolbar</div>,
  DesignerValidation: () => <div>Designer Validation</div>,
  TemplatePicker: () => <div>Template Picker</div>,
  DesignerPreview: ({ initialTab }: { initialTab?: 'graph' | 'rdf' | 'review' }) => (
    <div data-testid="designer-preview">{initialTab ?? 'graph'}</div>
  ),
}));

import { OntologyDesigner } from './OntologyDesigner';

beforeEach(() => {
  useDesignerStore.getState().resetDraft();
});

describe('OntologyDesigner', () => {
  it('defaults the preview to the graph tab', () => {
    render(<OntologyDesigner route={{ page: 'designer' }} />);

    expect(screen.getByTestId('designer-preview')).toHaveTextContent('graph');
  });

  it('can open directly on the review tab', () => {
    render(
      <OntologyDesigner
        route={{ page: 'designer' }}
        initialPreviewTab="review"
      />,
    );

    expect(screen.getByTestId('designer-preview')).toHaveTextContent('review');
  });
});
