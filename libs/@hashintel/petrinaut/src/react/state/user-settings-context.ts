import { createContext } from "react";

import {
  DEFAULT_BOTTOM_PANEL_HEIGHT,
  DEFAULT_LEFT_SIDEBAR_WIDTH,
  DEFAULT_PROPERTIES_PANEL_WIDTH,
} from "./panel-defaults";

import type {
  CanvasViewport,
  SavedCanvasViewport,
} from "./canvas-viewport-context";
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
  enableExperimentalIconPack: boolean;
  enableAutomaticArcConnections: boolean;
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
  snapToGrid: boolean;
  /**
   * Whether resting the pointer on a node highlights its neighbourhood.
   * Off, the canvas answers only to the selection.
   */
  highlightOnHover: boolean;
  partialSelection: boolean;
  enableNetComponents: boolean;
  /**
   * Persisted preference controlling whether the product walkthrough opens
   * automatically the next time the app initializes. The live open state is
   * held as component state seeded from this value, so toggling the preference
   * only takes effect at the next init — not the current session.
   */
  showWalkthroughOnInit: boolean;
  /**
   * Shows the Compilation tab in the bottom panel, which reports how the net's
   * user code lowered to HIR and what the GPU backend can take.
   *
   * Off by default: it explains the compiler rather than the model, so it is
   * only useful when you are debugging why something did not compile.
   */
  showCompilationOutput: boolean;
  /**
   * Shows a host's Brunch demo affordances, such as the demo site's
   * prepared-fixture selector. Toggled from a palette command the host
   * registers; the settings dialog has no control for it.
   */
  brunchDemoMode: boolean;
  /**
   * The AI assistant chosen in User settings, by plugin assistant id. `null`
   * until the user picks one; the editor then uses the first installed.
   */
  aiAssistantId: string | null;
  subViewPanels: SubViewPanelsSettings;
  /** Where each document's canvas was last left, keyed by document id. */
  canvasViewports: Record<string, SavedCanvasViewport>;
};

export type UserSettingsActions = {
  setShowAnimations: (value: boolean) => void;
  setKeepPanelsMounted: (value: boolean) => void;
  setCompactNodes: (value: boolean) => void;
  setEnableExperimentalIconPack: (value: boolean) => void;
  setEnableAutomaticArcConnections: (value: boolean) => void;
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
  setSnapToGrid: (value: boolean) => void;
  setHighlightOnHover: (value: boolean) => void;
  setPartialSelection: (value: boolean) => void;
  setEnableNetComponents: (value: boolean) => void;
  setShowWalkthroughOnInit: (value: boolean) => void;
  setShowCompilationOutput: (value: boolean) => void;
  setBrunchDemoMode: (value: boolean) => void;
  setAiAssistantId: (value: string | null) => void;
  updateSubViewSection: (
    containerName: string,
    sectionId: string,
    update: Partial<SubViewSectionSettings>,
  ) => void;
  setCanvasViewport: (petriNetId: string, viewport: CanvasViewport) => void;
};

export type UserSettingsContextValue = UserSettings & UserSettingsActions;

export const defaultUserSettings: UserSettings = {
  showAnimations: true,
  keepPanelsMounted: true,
  compactNodes: false,
  enableExperimentalIconPack: true,
  enableAutomaticArcConnections: false,
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
  snapToGrid: true,
  highlightOnHover: true,
  partialSelection: true,
  enableNetComponents: false,
  showWalkthroughOnInit: true,
  showCompilationOutput: false,
  brunchDemoMode: false,
  aiAssistantId: null,
  subViewPanels: {},
  canvasViewports: {},
};

/**
 * The value outside any provider. `UserSettingsProvider` compares against it
 * to tell whether an ancestor already provides the settings.
 */
export const defaultUserSettingsContextValue: UserSettingsContextValue = {
  ...defaultUserSettings,
  setShowAnimations: () => {},
  setKeepPanelsMounted: () => {},
  setCompactNodes: () => {},
  setEnableExperimentalIconPack: () => {},
  setEnableAutomaticArcConnections: () => {},
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
  setSnapToGrid: () => {},
  setHighlightOnHover: () => {},
  setPartialSelection: () => {},
  setEnableNetComponents: () => {},
  setShowWalkthroughOnInit: () => {},
  setShowCompilationOutput: () => {},
  setBrunchDemoMode: () => {},
  setAiAssistantId: () => {},
  updateSubViewSection: () => {},
  setCanvasViewport: () => {},
};

export const UserSettingsContext = createContext<UserSettingsContextValue>(
  defaultUserSettingsContextValue,
);
