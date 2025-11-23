import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class VisualizerErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error("Visualizer runtime error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  render(): ReactNode {
    const { hasError, error, errorInfo } = this.state;
    const { children } = this.props;

    if (hasError) {
      return (
        <div
          style={{
            padding: 16,
            backgroundColor: "#ffebee",
            color: "#c62828",
            borderRadius: 4,
            fontSize: 12,
            fontFamily: "monospace",
            maxHeight: 400,
            overflow: "auto",
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>
            Visualizer Runtime Error
          </div>
          <div style={{ marginBottom: 8 }}>
            <strong>Error:</strong> {error?.message}
          </div>
          {error?.stack && (
            <div style={{ marginBottom: 8 }}>
              <strong>Stack:</strong>
              <pre
                style={{
                  margin: "4px 0 0 0",
                  padding: 8,
                  backgroundColor: "#ffcdd2",
                  borderRadius: 2,
                  fontSize: 11,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {error.stack}
              </pre>
            </div>
          )}
          {errorInfo?.componentStack && (
            <div>
              <strong>Component Stack:</strong>
              <pre
                style={{
                  margin: "4px 0 0 0",
                  padding: 8,
                  backgroundColor: "#ffcdd2",
                  borderRadius: 2,
                  fontSize: 11,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {errorInfo.componentStack}
              </pre>
            </div>
          )}
        </div>
      );
    }

    return children;
  }
}
