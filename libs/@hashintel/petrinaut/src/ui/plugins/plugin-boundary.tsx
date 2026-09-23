import { Component, Suspense, type ContextType, type ReactNode } from "react";

import { ErrorTrackerContext } from "../../react/error-tracker-context";

import type {
  PetrinautPluginButtonPlacement,
  PetrinautPluginSettingsSection,
  PetrinautPluginSubViewPlacement,
} from "./plugin";

/** Where a contribution renders, as reported with its failures. */
export type PluginContributionPlace =
  | "component"
  | "commands"
  | "assistant"
  | "edit-view"
  | `settings-${PetrinautPluginSettingsSection}`
  | PetrinautPluginButtonPlacement
  | PetrinautPluginSubViewPlacement;

type Props = {
  pluginId: string;
  /** The contribution's id, or `component` / `commands` for those fields. */
  contributionId: string;
  place: PluginContributionPlace;
  /** A new value clears a failure, for example when a window opens again. */
  resetKey?: unknown;
  children: ReactNode;
};

type State = { failed: boolean; resetKey: unknown };

/**
 * Renders one plugin contribution so that it can load lazily and fail alone.
 * A suspended contribution renders nothing until it is ready; a thrown error
 * removes this contribution, reaches the host's error tracker, and leaves the
 * editor and the plugin's other contributions running.
 */
export class PluginContributionBoundary extends Component<Props, State> {
  static contextType = ErrorTrackerContext;
  declare context: ContextType<typeof ErrorTrackerContext>;

  state: State = { failed: false, resetKey: this.props.resetKey };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  static getDerivedStateFromProps(
    props: Props,
    state: State,
  ): Partial<State> | null {
    return Object.is(props.resetKey, state.resetKey)
      ? null
      : { failed: false, resetKey: props.resetKey };
  }

  componentDidCatch(error: unknown): void {
    this.context.captureException(error, {
      source: "plugin.contribution",
      tags: {
        pluginId: this.props.pluginId,
        contributionId: this.props.contributionId,
        place: this.props.place,
      },
    });
  }

  render(): ReactNode {
    return this.state.failed ? null : (
      <Suspense fallback={null}>{this.props.children}</Suspense>
    );
  }
}
