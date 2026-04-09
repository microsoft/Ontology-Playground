import { createRoot } from 'react-dom/client'
import App from './App.tsx'

// Note: StrictMode disabled due to Cytoscape.js incompatibility with double-mounting
// This only affects development - production builds don't use StrictMode anyway
createRoot(document.getElementById('root')!).render(
  <App />,
)
