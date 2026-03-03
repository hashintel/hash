import { createContext } from "react";

import {
  DEFAULT_BOTTOM_PANEL_HEIGHT,
  DEFAULT_LEFT_SIDEBAR_WIDTH,
  DEFAULT_PROPERTIES_PANEL_WIDTH,
} from "../constants/ui";
import type { BottomPanelTab, TimelineChartType } from "./editor-context";

export type UserSettings = {
  showAnimations: boolean;
  keepPanelsMounted: boolean;
  isLeftSidebarOpen: boolean;
  leftSidebarWidth: number;
  propertiesPanelWidth: number;
  isBottomPanelOpen: boolean;
  bottomPanelHeight: number;
  activeBottomPanelTab: BottomPanelTab;
  timelineChartType: TimelineChartType;
};

export type UserSettingsActions = {
  setShowAnimations: (value: boolean) => void;
  setKeepPanelsMounted: (value: boolean) => void;
  setIsLeftSidebarOpen: (value: boolean) => void;
  setLeftSidebarWidth: (value: number) => void;
  setPropertiesPanelWidth: (value: number) => void;
  setIsBottomPanelOpen: (value: boolean) => void;
  setBottomPanelHeight: (value: number) => void;
  setActiveBottomPanelTab: (value: BottomPanelTab) => void;
  setTimelineChartType: (value: TimelineChartType) => void;
};

export type UserSettingsContextValue = UserSettings & UserSettingsActions;

export const defaultUserSettings: UserSettings = {
  showAnimations: true,
  keepPanelsMounted: true,
  isLeftSidebarOpen: true,
  leftSidebarWidth: DEFAULT_LEFT_SIDEBAR_WIDTH,
  propertiesPanelWidth: DEFAULT_PROPERTIES_PANEL_WIDTH,
  isBottomPanelOpen: false,
  bottomPanelHeight: DEFAULT_BOTTOM_PANEL_HEIGHT,
  activeBottomPanelTab: "diagnostics",
  timelineChartType: "run",
};

const DEFAULT_CONTEXT_VALUE: UserSettingsContextValue = {
  ...defaultUserSettings,
  setShowAnimations: () => {},
  setKeepPanelsMounted: () => {},
  setIsLeftSidebarOpen: () => {},
  setLeftSidebarWidth: () => {},
  setPropertiesPanelWidth: () => {},
  setIsBottomPanelOpen: () => {},
  setBottomPanelHeight: () => {},
  setActiveBottomPanelTab: () => {},
  setTimelineChartType: () => {},
};

export const UserSettingsContext = createContext<UserSettingsContextValue>(
  DEFAULT_CONTEXT_VALUE,
);
