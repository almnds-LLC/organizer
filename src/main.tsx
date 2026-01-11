import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { showToast } from './store/toastStore'

registerSW({
  onNeedRefresh() {
    showToast({
      type: 'info',
      title: 'Update Available',
      message: 'A new version is ready. Refresh to update.',
      action: {
        label: 'Refresh',
        onClick: () => window.location.reload(),
      },
      duration: 0, // Don't auto-dismiss
    })
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
