import { useInstalledPlugins } from "./installed-plugins";
import {
  type PetrinautPluginSubView,
  type PetrinautPluginSubViewPlacement,
  selectPluginSubViews,
} from "./plugin";
import { PluginContributionBoundary } from "./plugin-boundary";

import type { SubView } from "../components/sub-view/types";
import type { ComponentType } from "react";

/**
 * Bound components are cached per contribution object, so a subview keeps one
 * component identity across renders and its state survives them. Plugins are
 * module constants, so the cache holds one entry per contribution.
 */
const boundComponents = new WeakMap<PetrinautPluginSubView, ComponentType>();

const boundComponentFor = (
  pluginId: string,
  subView: PetrinautPluginSubView,
): ComponentType => {
  const cached = boundComponents.get(subView);
  if (cached) {
    return cached;
  }
  const Inner = subView.component;
  const Bound = () => (
    <PluginContributionBoundary
      pluginId={pluginId}
      contributionId={subView.id}
      place={subView.placement}
    >
      <Inner />
    </PluginContributionBoundary>
  );
  Bound.displayName = `PluginSubView(${subView.id})`;
  boundComponents.set(subView, Bound);
  return Bound;
};

/**
 * The installed plugins' subviews for one panel, as the panel renders them:
 * without the placement, and with each component behind its own boundary.
 */
export const usePluginSubViews = (
  placement: PetrinautPluginSubViewPlacement,
): SubView[] =>
  selectPluginSubViews(useInstalledPlugins(), placement).map(
    ({ pluginId, subView }) => {
      const { placement: _placement, ...rendered } = subView;
      return { ...rendered, component: boundComponentFor(pluginId, subView) };
    },
  );
