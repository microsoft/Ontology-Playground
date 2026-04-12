import { useAppStore } from '../store/appStore';
import { HomeGraphSidebar } from './HomeGraphSidebar';
import { InspectorPanel } from './InspectorPanel';
import { QueryPlayground } from './QueryPlayground';
import { RdfEditorPanel } from './RdfEditorPanel';
import { SearchFilter } from './SearchFilter';

export function HomeSidebar() {
  const graphViewMode = useAppStore((state) => state.graphViewMode);

  if (graphViewMode === 'schema') {
    return (
      <>
        <SearchFilter />
        <InspectorPanel />
        <QueryPlayground />
        <RdfEditorPanel />
      </>
    );
  }

  return <HomeGraphSidebar />;
}
