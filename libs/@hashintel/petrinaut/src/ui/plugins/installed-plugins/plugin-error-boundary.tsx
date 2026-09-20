import { Component, type ContextType, type ReactNode } from "react";

import { ErrorTrackerContext } from "../../../react/error-tracker-context";

type Props = {
  pluginId: string;
  children: ReactNode;
};

type State = { failed: boolean };

/**
 * Keeps one plugin's failure from unmounting the editor: the plugin's
 * component disappears, the failure reaches the host's error tracker, and
 * everything else keeps running.
 */
export class PluginErrorBoundary extends Component<Props, State> {
  static contextType = ErrorTrackerContext;
  declare context: ContextType<typeof ErrorTrackerContext>;

  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    this.context.captureException(error, {
      source: "plugin.component",
      tags: { pluginId: this.props.pluginId },
    });
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}
