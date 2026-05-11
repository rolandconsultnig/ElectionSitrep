import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

/**
 * Catches render errors so a failed chunk / refresh bug shows text instead of a blank page.
 */
export class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[RootErrorBoundary]', error, info.componentStack)
  }

  override render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: '100vh',
            padding: 24,
            fontFamily: 'system-ui, sans-serif',
            background: '#0f172a',
            color: '#f8fafc',
          }}
        >
          <h1 style={{ fontSize: 20, marginBottom: 12 }}>App failed to render</h1>
          <p style={{ opacity: 0.85, marginBottom: 16 }}>
            Open the browser console (F12) for details. Try a hard refresh (Ctrl+Shift+R) or clear site data for
            localhost.
          </p>
          <pre
            style={{
              padding: 16,
              borderRadius: 8,
              background: '#020617',
              overflow: 'auto',
              fontSize: 13,
              whiteSpace: 'pre-wrap',
            }}
          >
            {this.state.error.stack ?? this.state.error.message}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}
