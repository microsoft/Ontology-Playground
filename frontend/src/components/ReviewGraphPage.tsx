import { useAppStore } from '../store/appStore';
import { ExtractionSidebar } from './ExtractionSidebar';
import { ReviewGraphWorkbench } from './ReviewGraphWorkbench';

export function ReviewGraphPage() {
  const darkMode = useAppStore((state) => state.darkMode);

  return (
    <div className={`review-graph-page ${darkMode ? '' : 'light-theme'}`}>
      <ExtractionSidebar />
      <ReviewGraphWorkbench />
    </div>
  );
}
