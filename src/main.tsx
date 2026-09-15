import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { I18nextProvider } from 'react-i18next'
import i18n from './i18n'

// Note: StrictMode disabled due to Cytoscape.js incompatibility with double-mounting
// This only affects development - production builds don't use StrictMode anyway
createRoot(document.getElementById('root')!).render(
  <I18nextProvider i18n={i18n}>
    <App />
  </I18nextProvider>,
)
