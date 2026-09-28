import { ShieldAlert } from 'lucide-react';
import type { ErrorInfo, ReactNode } from 'react';
import { Component } from 'react';
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    /* Do not serialize wallet state, addresses or provider errors into telemetry. */
  }
  render() {
    if (this.state.failed)
      return (
        <div className="fatal-error">
          <ShieldAlert aria-hidden="true" size={38} />
          <h1>This view could not load.</h1>
          <p>Your assets remain in PLabs Wallet. Reload to reconnect.</p>
          <button type="button" className="primary-button" onClick={() => window.location.reload()}>
            Reload application
          </button>
        </div>
      );
    return this.props.children;
  }
}
