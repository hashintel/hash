import { css } from "@hashintel/ds-helpers/css";
import { Component, type ErrorInfo, type ReactNode } from "react";

const errorContainerStyle = css({
  padding: "[16px]",
  backgroundColor: "[#ffebee]",
  color: "[#c62828]",
  borderRadius: "[4px]",
  fontSize: "[12px]",
  fontFamily: "[monospace]",
  maxHeight: "[400px]",
  overflow: "auto",
});

const errorTitleStyle = css({
  fontWeight: 600,
  fontSize: "[14px]",
  marginBottom: "[8px]",
});

const errorSectionStyle = css({
  marginBottom: "[8px]",
});

const stackPreStyle = css({
  margin: "[4px 0 0 0]",
  padding: "[8px]",
  backgroundColor: "[#ffcdd2]",
  borderRadius: "[2px]",
  fontSize: "[11px]",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
});

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
        <div className={errorContainerStyle}>
          <div className={errorTitleStyle}>Visualizer Runtime Error</div>
          <div className={errorSectionStyle}>
            <strong>Error:</strong> {error?.message}
          </div>
          {error?.stack && (
            <div className={errorSectionStyle}>
              <strong>Stack:</strong>
              <pre className={stackPreStyle}>{error.stack}</pre>
            </div>
          )}
          {errorInfo?.componentStack && (
            <div>
              <strong>Component Stack:</strong>
              <pre className={stackPreStyle}>{errorInfo.componentStack}</pre>
            </div>
          )}
        </div>
      );
    }

    return children;
  }
}
