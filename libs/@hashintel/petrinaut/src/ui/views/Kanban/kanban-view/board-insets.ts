/**
 * @role Distances the Kanban board keeps from the editor's overlay panels
 */
import { PANEL_MARGIN } from "../../../constants/ui";

export type BoardInsets = {
  left: number;
  right: number;
  bottom: number;
};

/**
 * The left sidebar, properties panel, and bottom panel float over the
 * canvas container. The net canvas can be panned out from under them, but
 * the board has a fixed layout, so it is inset by whichever panels are
 * showing. The sidebar counts as showing while search is open, even when
 * it is not toggled open, matching how the sidebar itself renders.
 */
export const getBoardInsets = ({
  isLeftSidebarOpen,
  isSearchOpen,
  leftSidebarWidth,
  hasSelection,
  propertiesPanelWidth,
  isBottomPanelOpen,
  bottomPanelHeight,
}: {
  isLeftSidebarOpen: boolean;
  isSearchOpen: boolean;
  leftSidebarWidth: number;
  hasSelection: boolean;
  propertiesPanelWidth: number;
  isBottomPanelOpen: boolean;
  bottomPanelHeight: number;
}): BoardInsets => ({
  left: isLeftSidebarOpen || isSearchOpen ? leftSidebarWidth + PANEL_MARGIN : 0,
  right: hasSelection ? propertiesPanelWidth + PANEL_MARGIN : 0,
  bottom: isBottomPanelOpen ? bottomPanelHeight + PANEL_MARGIN : 0,
});
