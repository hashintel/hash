import { createContext } from "react";

import {
  DEFAULT_BOTTOM_PANEL_HEIGHT,
  DEFAULT_LEFT_SIDEBAR_WIDTH,
  DEFAULT_PROPERTIES_PANEL_WIDTH,
} from "../constants/ui";
import type {
  BottomPanelTab,
  CursorMode,
  TimelineChartType,
} from "./editor-context";

export type ArcRendering = "smoothstep" | "bezier" | "custom";

export type SubViewSectionSettings = {
  collapsed: boolean;
  /** Last known panel height in pixels */
  height?: number;
};

/** Outer key: container name, inner key: subview ID */
export type SubViewPanelsSettings = Record<
  string,
  Record<string, SubViewSectionSettings>
>;

export type UserSettings = {
  showAnimations: boolean;
  keepPanelsMounted: boolean;
  compactNodes: boolean;
  arcRendering: ArcRendering;
  cursorMode: CursorMode;
  isLeftSidebarOpen: boolean;
  leftSidebarWidth: number;
  propertiesPanelWidth: number;
  isBottomPanelOpen: boolean;
  bottomPanelHeight: number;
  activeBottomPanelTab: BottomPanelTab;
  timelineChartType: TimelineChartType;
  showMinimap: boolean;
  partialSelection: boolean;
  useEntitiesTreeView: boolean;
  subViewPanels: SubViewPanelsSettings;
};

export type UserSettingsActions = {
  setShowAnimations: (value: boolean) => void;
  setKeepPanelsMounted: (value: boolean) => void;
  setCompactNodes: (value: boolean) => void;
  setArcRendering: (value: ArcRendering) => void;
  setIsLeftSidebarOpen: (value: boolean) => void;
  setLeftSidebarWidth: (value: number) => void;
  setPropertiesPanelWidth: (value: number) => void;
  setIsBottomPanelOpen: (value: boolean) => void;
  setBottomPanelHeight: (value: number) => void;
  setActiveBottomPanelTab: (value: BottomPanelTab) => void;
  setCursorMode: (value: CursorMode) => void;
  setTimelineChartType: (value: TimelineChartType) => void;
  setShowMinimap: (value: boolean) => void;
  setPartialSelection: (value: boolean) => void;
  setUseEntitiesTreeView: (value: boolean) => void;
  updateSubViewSection: (
    containerName: string,
    sectionId: string,
    update: Partial<SubViewSectionSettings>,
  ) => void;
};

export type UserSettingsContextValue = UserSettings & UserSettingsActions;

export const defaultUserSettings: UserSettings = {
  showAnimations: true,
  keepPanelsMounted: true,
  compactNodes: false,
  arcRendering: "custom",
  cursorMode: "pan",
  isLeftSidebarOpen: true,
  leftSidebarWidth: DEFAULT_LEFT_SIDEBAR_WIDTH,
  propertiesPanelWidth: DEFAULT_PROPERTIES_PANEL_WIDTH,
  isBottomPanelOpen: false,
  bottomPanelHeight: DEFAULT_BOTTOM_PANEL_HEIGHT,
  activeBottomPanelTab: "diagnostics",
  timelineChartType: "run",
  showMinimap: true,
  partialSelection: true,
  useEntitiesTreeView: false,
  subViewPanels: {},
};

const DEFAULT_CONTEXT_VALUE: UserSettingsContextValue = {
  ...defaultUserSettings,
  setShowAnimations: () => {},
  setKeepPanelsMounted: () => {},
  setCompactNodes: () => {},
  setArcRendering: () => {},
  setIsLeftSidebarOpen: () => {},
  setLeftSidebarWidth: () => {},
  setPropertiesPanelWidth: () => {},
  setIsBottomPanelOpen: () => {},
  setBottomPanelHeight: () => {},
  setActiveBottomPanelTab: () => {},
  setCursorMode: () => {},
  setTimelineChartType: () => {},
  setShowMinimap: () => {},
  setPartialSelection: () => {},
  setUseEntitiesTreeView: () => {},
  updateSubViewSection: () => {},
};

export const UserSettingsContext = createContext<UserSettingsContextValue>(
  DEFAULT_CONTEXT_VALUE,
);
