import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { InspectorPanel } from './InspectorPanel';
import { useAppStore } from '../store/appStore';

function setupDataBindingQuestStep() {
  useAppStore.getState().resetToDefault();
  useAppStore.getState().startQuest('quest-5');
  useAppStore.getState().advanceQuestStep(); // Move from step 1 to step 2 (property step)
  useAppStore.getState().selectEntity('customer');
}

describe('InspectorPanel quest progression', () => {
  beforeEach(() => {
    useAppStore.getState().resetToDefault();
    vi.restoreAllMocks();
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('advances the property quest step when clicking the property row', () => {
    setupDataBindingQuestStep();

    render(<InspectorPanel />);

    expect(useAppStore.getState().currentStepIndex).toBe(1);

    const propertiesHeader = screen.getByText(/Properties \(\d+\)/i);
    const propertiesSection = propertiesHeader.closest('.inspector-section');
    expect(propertiesSection).toBeTruthy();

    const propertyInList = within(propertiesSection as HTMLElement).getByText('name');
    fireEvent.click(propertyInList);

    expect(useAppStore.getState().currentStepIndex).toBe(2);
  });

  it('advances the property quest step when clicking the data binding mapping row', () => {
    setupDataBindingQuestStep();

    render(<InspectorPanel />);

    expect(useAppStore.getState().currentStepIndex).toBe(1);

    const bindingsHeader = screen.getByText('Data Bindings');
    const bindingsSection = bindingsHeader.closest('.inspector-section');
    expect(bindingsSection).toBeTruthy();

    const mappedColumn = within(bindingsSection as HTMLElement).getByText('full_name');
    fireEvent.click(mappedColumn);

    expect(useAppStore.getState().currentStepIndex).toBe(2);
  });
});
