import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode; panel: string }

type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[odyssey-companion] ${this.props.panel} render failed`, error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary-fallback">
          <h1>Something went wrong</h1>
          <p className="muted">
            ({this.props.panel}) {this.state.error.message}
          </p>
          <pre className="error-boundary-stack">{this.state.error.stack}</pre>
        </div>
      )
    }
    return this.props.children
  }
}
