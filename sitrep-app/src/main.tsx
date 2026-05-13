import './bootstrap-theme'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { RootErrorBoundary } from './components/RootErrorBoundary'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import './charts/register'
import './index.css'
import App from './App.tsx'

const queryClient = new QueryClient()
const rootEl = document.getElementById('root')

function escapeHtml(s: string) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function showBootFailure(message: string) {
  if (!rootEl) return
  const safe = escapeHtml(message)
  rootEl.innerHTML = `<div style="margin:0;padding:1.25rem;font-family:system-ui,sans-serif;background:#fef2f2;color:#991b1b;max-width:42rem"><strong>Could not start the app.</strong><p style="margin:0.75rem 0 0;font-size:0.9rem;white-space:pre-wrap">${safe}</p><p style="margin:0.75rem 0 0;font-size:0.85rem;color:#7f1d1d">Check the browser console (F12) and the Network tab for failed script requests. Use <code>http://localhost:5535</code> with the dev server running.</p></div>`
}

if (!rootEl) {
  document.body.insertAdjacentHTML(
    'afterbegin',
    '<p style="padding:1rem;font-family:system-ui">Missing #root in index.html.</p>',
  )
} else {
  try {
    createRoot(rootEl).render(
      <StrictMode>
        <RootErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <BrowserRouter>
              <ThemeProvider>
                <AuthProvider>
                  <App />
                </AuthProvider>
              </ThemeProvider>
            </BrowserRouter>
          </QueryClientProvider>
        </RootErrorBoundary>
      </StrictMode>,
    )
  } catch (e) {
    const msg = e instanceof Error ? `${e.message}\n\n${e.stack ?? ''}` : String(e)
    showBootFailure(msg)
  }
}
