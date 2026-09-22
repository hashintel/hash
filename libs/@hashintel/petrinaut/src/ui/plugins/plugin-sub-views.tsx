import { useInstalledPlugins } from "./installed-plugins";
import {
  type PetrinautPluginSubView,
  type PetrinautPluginSubViewPlacement,
  selectPluginSubViews,
} from "./plugin";
import { PluginContributionBoundary } from "./plugin-boundary";

import type { SubView } from "../components/sub-view/types";
import type { ReactNode } from "react";

type BoundParts = Pick<
  SubView,
  "component" | "icon" | "renderHeaderAction" | "renderTitle"
>;

/**
 * Bound parts are cached per contribution object, so a subview keeps one
 * component identity across renders and its state survives them. Plugins are
 * module constants, so the cache holds one entry per contribution.
 */
const boundParts = new WeakMap<PetrinautPluginSubView, BoundParts>();

/**
 * Puts every part of a subview the plugin renders behind its own boundary:
 * the content, the icon, the header action and a main subview's title. A
 * render function becomes a component first, so it runs inside the boundary.
 * A part the plugin leaves out stays absent, because the panels test for
 * `renderHeaderAction` and `renderTitle` before they draw a header.
 */
const bindSubView = (
  pluginId: string,
  subView: PetrinautPluginSubView,
): BoundParts => {
  const cached = boundParts.get(subView);
  if (cached) {
    return cached;
  }
  const inBoundary = (children: ReactNode) => (
    <PluginContributionBoundary
      pluginId={pluginId}
      contributionId={subView.id}
      place={subView.placement}
    >
      {children}
    </PluginContributionBoundary>
  );

  const {
    component: Content,
    icon: Icon,
    renderHeaderAction,
    renderTitle,
  } = subView;
  const Component = () => inBoundary(<Content />);
  Component.displayName = `PluginSubView(${subView.id})`;

  const HeaderAction = () => renderHeaderAction?.() ?? null;
  const Title = () => renderTitle?.() ?? null;

  const bound: BoundParts = {
    component: Component,
    icon: Icon && (({ size }) => inBoundary(<Icon size={size} />)),
    renderHeaderAction:
      renderHeaderAction && (() => inBoundary(<HeaderAction />)),
    renderTitle: renderTitle && (() => inBoundary(<Title />)),
  };
  boundParts.set(subView, bound);
  return bound;
};

/**
 * The installed plugins' subviews for one panel, as the panel renders them:
 * without the placement, and with each rendered part behind a boundary.
 */
export const usePluginSubViews = (
  placement: PetrinautPluginSubViewPlacement,
): SubView[] =>
  selectPluginSubViews(useInstalledPlugins(), placement).map(
    ({ pluginId, subView }) => {
      const { placement: _placement, ...rendered } = subView;
      return { ...rendered, ...bindSubView(pluginId, subView) };
    },
  );
