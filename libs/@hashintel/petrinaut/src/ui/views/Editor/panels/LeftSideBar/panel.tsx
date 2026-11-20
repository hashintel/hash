import { use } from "react";

import { css, cva, cx } from "@hashintel/ds-helpers/css";

import { CompositionContext } from "../../../../../react/state/composition-context";
import { useEditorFields } from "../../../../../react/state/editor-context";
import { usePanelPresence } from "../../../../../react/state/panel-presence-context";
import { usePanelSizes } from "../../../../../react/state/panel-sizes-context";
import { useComposesOnly } from "../../../../../react/state/use-composes-only";
import { useIsCompositionInterfaceOn } from "../../../../../react/state/use-is-composition-interface-on";
import { useUserSettingsFields } from "../../../../../react/state/user-settings-context";
import { GlassPanel } from "../../../../components/glass-panel";
import { VerticalSubViewsContainer } from "../../../../components/sub-view/vertical/vertical-sub-views-container";
import {
  MAX_LEFT_SIDEBAR_WIDTH,
  MIN_LEFT_SIDEBAR_WIDTH,
} from "../../../../constants/ui";
import { styleRef, useReading } from "../../../../lib/readings";
import { FocusRoot, FocusStack } from "../../../../worksheet/focus-stack";
import { slideFromEdge } from "../../shared/slide-from-edge";
import {
  componentsSubView,
  entitiesTreeSubView,
  netsListSubView,
  searchSubView,
} from "./sub-views";

const searchSubViews = [searchSubView];

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
      // Where the panel is comes from its presence value; this is only what
      // a closed panel must not do.
      false: {
        pointerEvents: "none",
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
  const { isLeftSidebarOpen: isOpen, isSearchOpen } = useEditorFields(
    "isLeftSidebarOpen",
    "isSearchOpen",
  );
  const { shown } = usePanelPresence();
  // Still sliding out, where a closed panel is not kept mounted.
  const isInView = useReading(() => shown.leftSidebar.get() > 0);
  const { offered } = use(CompositionContext);
  const composesOnly = useComposesOnly();
  const isCompositionInterfaceOn = useIsCompositionInterfaceOn();

  const { leftSidebarWidth } = usePanelSizes();
  const { keepPanelsMounted, setLeftSidebarWidth: saveWidth } =
    useUserSettingsFields("keepPanelsMounted", "setLeftSidebarWidth");

  // The sidebar is visible when explicitly opened OR when search is active
  const isVisible = isOpen || isSearchOpen;

  // The Nets list and the Components panel are part of the composition
  // interface. The Components panel lists the libraries on offer, and is all
  // an editor that only composes has to show.
  const sidebarSubViews = [
    ...(composesOnly ? [] : [entitiesTreeSubView]),
    ...(isCompositionInterfaceOn && !composesOnly ? [netsListSubView] : []),
    ...(isCompositionInterfaceOn && offered.length > 0
      ? [componentsSubView]
      : []),
  ];

  if (!isVisible && !isInView && !keepPanelsMounted) {
    return null;
  }

  return (
    <GlassPanel
      className={cx(glassPanelBaseStyle, panelStyle({ open: isVisible }))}
      ref={styleRef({
        width: leftSidebarWidth,
        transform: () => slideFromEdge("left", shown.leftSidebar.get()),
      })}
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
