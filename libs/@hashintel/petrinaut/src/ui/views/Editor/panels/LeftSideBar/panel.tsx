/**
 * @layerRoot ui.views.editor.left-sidebar
 * @role Lists the entities, the nets, the library components and the search results of a document as sections in the left panel
 */

import { use } from "react";

import { css, cva } from "@hashintel/ds-helpers/css";

import { CompositionContext } from "../../../../../react/state/composition-context";
import { useEditorFields } from "../../../../../react/state/editor-context";
import { useComposesOnly } from "../../../../../react/state/use-composes-only";
import { useIsCompositionInterfaceOn } from "../../../../../react/state/use-is-composition-interface-on";
import { KeptState } from "../../../../components/kept-state";
import { VerticalSubViewsContainer } from "../../../../components/sub-view/vertical/vertical-sub-views-container";
import { FocusRoot, FocusStack } from "../../../../worksheet/focus-stack";
import { DockedPanel } from "../../shared/docked-panel";
import { leftSidebarSubViews, searchSubView } from "./sub-views";
import { SearchQueryProvider } from "./subviews/search-panel";

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
  const { offered } = use(CompositionContext);
  const composesOnly = useComposesOnly();
  const isCompositionInterfaceOn = useIsCompositionInterfaceOn();

  const isVisible = isOpen || isSearchOpen;

  const sidebarSubViews = leftSidebarSubViews({
    composesOnly,
    compositionInterfaceOn: isCompositionInterfaceOn,
    offersLibraries: offered.length > 0,
  });

  return (
    // Above the panel, which unmounts when it closes: the text searched for,
    // the collapsed groups and the scroll offsets are there when it opens
    // again.
    <SearchQueryProvider>
      <KeptState>
        <DockedPanel
          panel="leftSidebar"
          isOpen={isVisible}
          className={glassPanelBaseStyle}
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
        </DockedPanel>
      </KeptState>
    </SearchQueryProvider>
  );
};
