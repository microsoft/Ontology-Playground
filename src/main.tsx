import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { getLocale } from './i18n'

// index.html ships lang="en"; reflect the stored locale before first paint so
// screen readers and the browser's own UI agree with what's on screen.
document.documentElement.lang = getLocale()

// Note: StrictMode disabled due to Cytoscape.js incompatibility with double-mounting
// This only affects development - production builds don't use StrictMode anyway
createRoot(document.getElementById('root')!).render(
  <App />,
)
