/** The tabs the bottom panel draws for the running plugins' views. */

import { pluginBottomPanelViewId } from "./define-petrinaut-plugin";
import { PluginBoundary } from "./plugin-boundary";
import { useRunningPlugins } from "./running-plugins";

import type { PluginBottomPanelTab } from "../../react/state/editor-context";
import type { ReactNode } from "react";

/** A plugin's bottom panel view, as the panel draws its tab. */
export interface PluginBottomPanelTabView {
  readonly id: PluginBottomPanelTab;
  readonly title: string;
  readonly tooltip?: string;
  /** What fills the panel while the tab is the active one. */
  readonly content: ReactNode;
  /** What sits at the right of the tab bar while the tab is the active one. */
  readonly headerAction: ReactNode;
}

/**
 * Every plugin's bottom panel views that show, in plugin order. A view's
 * content and its header action each sit behind the plugin's boundary.
 */
export const usePluginBottomPanelViews =
  (): readonly PluginBottomPanelTabView[] =>
    useRunningPlugins().flatMap(({ manifest, instanceKey, contributions }) =>
      Object.entries(manifest.bottomPanelViews ?? {}).flatMap(([key, spec]) => {
        const view = contributions.bottomPanelViews?.[key];
        if (view === undefined || view.when === false) {
          return [];
        }
        const behindBoundary = (part: string, node: ReactNode) => (
          <PluginBoundary
            // Keyed per view: the panel draws one at a time in the same
            // place, and a boundary that caught an error stays empty.
            key={`${instanceKey}.bottomPanelViews.${key}.${part}`}
            pluginId={manifest.id}
            place="bottom-panel"
            contributionId={key}
          >
            {node}
          </PluginBoundary>
        );

        return [
          {
            id: pluginBottomPanelViewId(manifest.id, key),
            title: spec.title,
            ...(spec.tooltip !== undefined && { tooltip: spec.tooltip }),
            content: behindBoundary("content", view.content),
            headerAction: behindBoundary("headerAction", view.headerAction),
          },
        ];
      }),
    );
