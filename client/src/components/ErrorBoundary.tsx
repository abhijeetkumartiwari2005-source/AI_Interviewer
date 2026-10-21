// Last line of defence: a render crash shows a recoverable message instead of a blank page.
// The interview lives on the server, so reloading offers to resume where the candidate left off.
import { Component, type ErrorInfo, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ui] render crash', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="page">
        <section className="card crash" role="alert">
          <h1>Something went wrong</h1>
          <p className="muted">
            The page hit an unexpected error. Your interview is saved, so reloading will offer to pick up where you left off.
          </p>
          <p className="muted small crash__detail">{this.state.error.message}</p>
          <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </section>
      </main>
    );
  }
}
