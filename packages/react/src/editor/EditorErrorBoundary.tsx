import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface EditorErrorBoundaryProps {
  children: ReactNode;
  /** Rendered instead of the editor once it has thrown. */
  fallback: (error: Error, retry: () => void) => ReactNode;
  /** Changing this resets the boundary: a new page gets a fresh attempt. */
  resetKey?: string;
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  error: Error | null;
  resetKey: string | undefined;
}

/**
 * docs/09 P2-T01. A Slate value that a plugin cannot render throws during render, and React
 * unmounts the whole tree above it - which here is the shell. This keeps the damage inside
 * the canvas, so the sidebar, the palette and the other pages stay usable.
 */
export class EditorErrorBoundary extends Component<EditorErrorBoundaryProps, State> {
  override state: State = { error: null, resetKey: undefined };

  static getDerivedStateFromProps(props: EditorErrorBoundaryProps, state: State): State | null {
    if (state.resetKey === props.resetKey) return null;
    return { error: null, resetKey: props.resetKey };
  }

  static getDerivedStateFromError(error: Error): Pick<State, 'error'> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  private readonly retry = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    return error === null ? this.props.children : this.props.fallback(error, this.retry);
  }
}
