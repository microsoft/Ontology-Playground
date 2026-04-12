import { useAppStore } from '../../store/appStore';
import { AlignmentWorkspace } from './AlignmentWorkspace';

export function AlignmentPage() {
  const darkMode = useAppStore((state) => state.darkMode);

  return (
    <div className={`alignment-page ${darkMode ? '' : 'light-theme'}`}>
      <AlignmentWorkspace />
    </div>
  );
}
