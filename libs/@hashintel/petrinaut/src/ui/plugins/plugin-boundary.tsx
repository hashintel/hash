import { Component, type ContextType, type ReactNode, Suspense } from "react";

import { ErrorTrackerContext } from "../../react/error-tracker-context";

import type { PluginButtonPlace } from "./define-petrinaut-plugin";

/** Where a plugin's code runs, as reported with its failures. */
type PluginPlace = "hook" | "root" | "settings" | PluginButtonPlace;

type Props = {
  pluginId: string;
  place: PluginPlace;
  /** The contribution's key, where a place holds several. */
  contributionId?: string;
  /** Called after the failure is reported. */
  onError?: () => void;
  children: ReactNode;
};

/**
 * Lets a plugin's hook, or one of its contributions, load lazily and fail
 * alone. A suspended child renders nothing until it is ready; a thrown error
 * renders nothing, reaches the host's error tracker, and leaves the editor and
 * the other contributions running.
 */
export class PluginBoundary extends Component<Props, { failed: boolean }> {
  static contextType = ErrorTrackerContext;
  declare context: ContextType<typeof ErrorTrackerContext>;

  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    const { pluginId, place, contributionId, onError } = this.props;
    this.context.captureException(error, {
      source: "plugin",
      tags:
        contributionId === undefined
          ? { pluginId, place }
          : { pluginId, place, contributionId },
    });
    onError?.();
  }

  render(): ReactNode {
    return this.state.failed ? null : (
      <Suspense fallback={null}>{this.props.children}</Suspense>
    );
  }
}
