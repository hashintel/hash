import { use, useMemo } from "react";

import { css, cva, cx } from "@hashintel/ds-helpers/css";

import { CompositionContext } from "../../../../../react/state/composition-context";
import { EditorContext } from "../../../../../react/state/editor-context";
import { useIsPanelAnimating } from "../../../../../react/state/panel-animation-context";
import { usePanelSizes } from "../../../../../react/state/panel-sizes-context";
import { useComposesOnly } from "../../../../../react/state/use-composes-only";
import { useIsCompositionInterfaceOn } from "../../../../../react/state/use-is-composition-interface-on";
import { UserSettingsContext } from "../../../../../react/state/user-settings-context";
import { GlassPanel } from "../../../../components/glass-panel";
import { VerticalSubViewsContainer } from "../../../../components/sub-view/vertical/vertical-sub-views-container";
import {
  MAX_LEFT_SIDEBAR_WIDTH,
  MIN_LEFT_SIDEBAR_WIDTH,
} from "../../../../constants/ui";
import { LEFT_SIDEBAR_SUBVIEWS } from "../../../../constants/ui-subviews";
import { styleRef } from "../../../../lib/readings";
import { FocusRoot, FocusStack } from "../../../../worksheet/focus-stack";
import { searchSubView } from "./subviews/search-panel";

const glassPanelBaseStyle = css({
  position: "absolute",
  zIndex: "[calc(var(--z-index-sticky) - 1)]",
  top: "0",
  left: "0",
  bottom: "0",
  borderRightWidth: "thin",
  boxSizing: "border-box",
});

const panelStyle = cva({
  base: {},
  variants: {
    open: {
      true: {},
      false: {
        transform: "translateX(-100%)",
        pointerEvents: "none",
      },
    },
    animating: {
      true: {
        // One `transition`, not the three properties it stands for: Panda
        // writes each of those with a custom property beside it, which every
        // element in the panel inherits. Switching this variant on or off
        // then restyles the whole panel.
        transition:
          "[width 150ms cubic-bezier(0.16, 1, 0.3, 1), opacity 150ms cubic-bezier(0.16, 1, 0.3, 1), height 150ms cubic-bezier(0.16, 1, 0.3, 1), top 150ms cubic-bezier(0.16, 1, 0.3, 1), left 150ms cubic-bezier(0.16, 1, 0.3, 1), right 150ms cubic-bezier(0.16, 1, 0.3, 1), bottom 150ms cubic-bezier(0.16, 1, 0.3, 1), transform 150ms cubic-bezier(0.16, 1, 0.3, 1)]",
      },
    },
  },
});

const contentWrapperStyle = css({
  position: "relative",
  height: "full",
  overflow: "hidden",
});

const contentLayerStyle = cva({
  base: {
    position: "absolute",
    inset: "0",
    display: "flex",
    flexDirection: "column",
    transition: "[opacity 120ms ease-in-out, transform 120ms ease-in-out]",
  },
  variants: {
    active: {
      true: {
        opacity: "1",
        transform: "none",
        pointerEvents: "auto",
      },
      false: {
        opacity: "0",
        pointerEvents: "none",
        visibility: "hidden",
      },
    },
    direction: {
      forward: {},
      backward: {},
    },
  },
  compoundVariants: [
    {
      active: false,
      direction: "forward",
      css: { transform: "translateX(-8px)" },
    },
    {
      active: false,
      direction: "backward",
      css: { transform: "translateX(8px)" },
    },
  ],
});

/**
 * LeftSideBar displays tools and content panels.
 * Visibility is controlled by the TopBar's sidebar toggle.
 * Resizable from the right edge.
 */
export const LeftSideBar: React.FC = () => {
  const { isLeftSidebarOpen: isOpen, isSearchOpen } = use(EditorContext);
  const isPanelAnimating = useIsPanelAnimating();
  const { offered } = use(CompositionContext);
  const composesOnly = useComposesOnly();
  const isCompositionInterfaceOn = useIsCompositionInterfaceOn();

  const { leftSidebarWidth } = usePanelSizes();
  const { keepPanelsMounted, setLeftSidebarWidth: saveWidth } =
    use(UserSettingsContext);

  // The sidebar is visible when explicitly opened OR when search is active
  const isVisible = isOpen || isSearchOpen;

  // The Nets list and the Components panel are part of the composition
  // interface. The Components panel lists the libraries on offer, and is all
  // an editor that only composes has to show.
  const sidebarSubViews = LEFT_SIDEBAR_SUBVIEWS.filter((subView) => {
    if (subView.id === "components") {
      return isCompositionInterfaceOn && offered.length > 0;
    }
    if (composesOnly) {
      return false;
    }
    return subView.id !== "nets-list" || isCompositionInterfaceOn;
  });

  const searchSubViews = useMemo(() => [searchSubView], []);

  if (!isVisible && !isPanelAnimating && !keepPanelsMounted) {
    return null;
  }

  return (
    <GlassPanel
      className={cx(
        glassPanelBaseStyle,
        panelStyle({ open: isVisible, animating: isPanelAnimating }),
      )}
      ref={styleRef({ width: leftSidebarWidth })}
      resizable={{
        edge: "right",
        getSize: () => leftSidebarWidth.get(),
        onResize: (width) => leftSidebarWidth.set(width),
        onResizeEnd: () => saveWidth(leftSidebarWidth.get()),
        minSize: MIN_LEFT_SIDEBAR_WIDTH,
        maxSize: MAX_LEFT_SIDEBAR_WIDTH,
      }}
    >
      <div className={contentWrapperStyle}>
        <div
          className={contentLayerStyle({
            active: !isSearchOpen,
            direction: "forward",
          })}
        >
          <VerticalSubViewsContainer
            name="left-sidebar"
            subViews={sidebarSubViews}
          />
        </div>
        <div
          className={contentLayerStyle({
            active: isSearchOpen,
            direction: "backward",
          })}
        >
          {/* One vertical focus flow joins the search input in the header
              with the result list below it. */}
          <FocusRoot>
            <FocusStack axis="vertical">
              <VerticalSubViewsContainer
                name="left-sidebar-search"
                subViews={searchSubViews}
              />
            </FocusStack>
          </FocusRoot>
        </div>
      </div>
    </GlassPanel>
  );
};
