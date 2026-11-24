import type { BottomPanelTab } from "../../../../../react/state/editor-context";

/**
 * The tab the bottom panel shows when the active one is no longer among
 * those available, or null when it still is.
 *
 * A simulation's timeline goes with the simulation, and the panel then
 * returns to the settings the next run starts from. Any other tab that goes
 * gives way to the first one left.
 */
export const fallbackBottomPanelTab = (
  activeTab: BottomPanelTab,
  availableTabs: readonly BottomPanelTab[],
): BottomPanelTab | null => {
  if (availableTabs.includes(activeTab)) {
    return null;
  }
  return activeTab === "simulation-timeline" &&
    availableTabs.includes("simulation-settings")
    ? "simulation-settings"
    : (availableTabs[0] ?? null);
};
