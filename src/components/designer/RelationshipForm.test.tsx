import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RelationshipForm } from './RelationshipForm';
import { useDesignerStore } from '../../store/designerStore';

// Reset the draft between tests
beforeEach(() => {
  useDesignerStore.getState().resetDraft();
});

describe('RelationshipForm — self-referencing relationships (issue #64)', () => {
  it('prompts to create an entity and disables Add when there are no entities', () => {
    render(<RelationshipForm />);

    expect(screen.getByText('Create at least one entity first.')).toBeInTheDocument();
    expect(
      screen.getByTitle('Create at least one entity to add a relationship'),
    ).toBeDisabled();
  });

  it('enables Add with a single entity and creates a self-referencing relationship', () => {
    useDesignerStore.getState().addEntity();
    const entityId = useDesignerStore.getState().ontology.entityTypes[0].id;

    render(<RelationshipForm />);

    const addBtn = screen.getByTitle('Add relationship');
    expect(addBtn).toBeEnabled();

    fireEvent.click(addBtn);

    const rels = useDesignerStore.getState().ontology.relationships;
    expect(rels).toHaveLength(1);
    expect(rels[0].from).toBe(entityId);
    expect(rels[0].to).toBe(entityId);
  });

  it('defaults the target to a second entity when more than one exists', () => {
    useDesignerStore.getState().addEntity();
    useDesignerStore.getState().addEntity();
    const [first, second] = useDesignerStore.getState().ontology.entityTypes;

    render(<RelationshipForm />);

    fireEvent.click(screen.getByTitle('Add relationship'));

    const rel = useDesignerStore.getState().ontology.relationships[0];
    expect(rel.from).toBe(first.id);
    expect(rel.to).toBe(second.id);
    expect(rel.from).not.toBe(rel.to);
  });

  it('does not show a "must be different" warning for a self-referencing relationship', () => {
    useDesignerStore.getState().addEntity();
    const entityId = useDesignerStore.getState().ontology.entityTypes[0].id;
    useDesignerStore.getState().addRelationship(entityId, entityId);
    const relId = useDesignerStore.getState().ontology.relationships[0].id;
    useDesignerStore.getState().selectRelationship(relId);

    render(<RelationshipForm />);

    expect(screen.queryByText(/source and target/i)).toBeNull();
    expect(screen.queryByText(/self-referencing relationship/i)).toBeNull();
  });
});
