import React from 'react';
import { logger } from '../lib/logger';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Catches render-time errors anywhere in the popup/options tree so a bug in
 * one view (e.g. a malformed snapshot from the API) can't blank the whole
 * UI. This is a class component because React error boundaries currently
 * require lifecycle methods that hooks don't expose.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    logger.error('Unhandled UI error:', error, info.componentStack);
  }

  private handleReload = (): void => {
    this.setState({ hasError: false });
  };

  render(): React.ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="p-4 text-center">
        <p className="text-sm font-semibold text-red-500 mb-1">Something went wrong.</p>
        <p className="text-xs text-zinc-400 mb-3">
          The extension hit an unexpected error rendering this view.
        </p>
        <button
          onClick={this.handleReload}
          className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs px-3 py-1.5 rounded cursor-pointer transition"
        >
          Try again
        </button>
      </div>
    );
  }
}
