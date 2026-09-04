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
  partialSelection: boolean;
  useEntitiesTreeView: boolean;
  enableNetComponents: boolean;
  enableNotebookView: boolean;
  /**
   * Experimental: offer the ad-hoc scenario form — inline Initial State +
   * Parameters — in Simulation Settings, experiments, optimizations, and
   * scenario creation. Off, every surface renders as before the feature.
   */
  enableAdHocScenarios: boolean;
  /**
   * Persisted preference controlling whether the product walkthrough opens
   * automatically the next time the app initializes. The live open state is
   * held as component state seeded from this value, so toggling the preference
   * only takes effect at the next init — not the current session.
   */
  showWalkthroughOnInit: boolean;
  /**
   * Whether the WebGPU backend is offered at all.
   *
   * A master switch, not a choice of engine: with it on, each experiment picks
   * its own backend as it is created, so a GPU and a CPU experiment can run side
   * by side. Off means the per-experiment control is not shown.
   *
   * The backend is a restricted subset engine — bounded state, 32-bit numbers —
   * and uses a different random generator, so it does not reproduce CPU
   * trajectories seed for seed (it agrees statistically).
   */
  webGpuEnabled: boolean;
  /**
   * Shows the Compilation tab in the bottom panel, which reports how the net's
   * user code lowered to HIR and what the GPU backend can take.
   *
   * Off by default: it explains the compiler rather than the model, so it is
   * only useful when you are debugging why something did not compile.
   */
  showCompilationOutput: boolean;
  /**
   * Experimental: offer parameter sweeps. On, every numeric scenario parameter
   * in the experiment form gets a Sweep toggle that turns its value into an
   * interval. Off, experiments take fixed values only.
   */
  enableParameterSweeps: boolean;
  /**
   * Experimental: show the optimization drawer's Surface section, which
   * recomputes the objective locally over two optimized parameters. Off, a
   * study drawer runs no compute of its own.
   */
  enableOptimizationSurface: boolean;
  subViewPanels: SubViewPanelsSettings;
  /** Where each document's canvas was last left, keyed by document id. */
  canvasViewports: Record<string, SavedCanvasViewport>;
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
  setSnapToGrid: (value: boolean) => void;
  setPartialSelection: (value: boolean) => void;
  setUseEntitiesTreeView: (value: boolean) => void;
  setEnableNetComponents: (value: boolean) => void;
  setEnableNotebookView: (value: boolean) => void;
  setEnableAdHocScenarios: (value: boolean) => void;
  setShowWalkthroughOnInit: (value: boolean) => void;
  setWebGpuEnabled: (value: boolean) => void;
  setShowCompilationOutput: (value: boolean) => void;
  setEnableParameterSweeps: (value: boolean) => void;
  setEnableOptimizationSurface: (value: boolean) => void;
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
  partialSelection: true,
  useEntitiesTreeView: false,
  enableNetComponents: false,
  enableNotebookView: false,
  enableAdHocScenarios: false,
  showWalkthroughOnInit: true,
  webGpuEnabled: false,
  showCompilationOutput: false,
  enableParameterSweeps: false,
  enableOptimizationSurface: false,
  subViewPanels: {},
  canvasViewports: {},
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
  setSnapToGrid: () => {},
  setPartialSelection: () => {},
  setUseEntitiesTreeView: () => {},
  setEnableNetComponents: () => {},
  setEnableNotebookView: () => {},
  setEnableAdHocScenarios: () => {},
  setShowWalkthroughOnInit: () => {},
  setWebGpuEnabled: () => {},
  setShowCompilationOutput: () => {},
  setEnableParameterSweeps: () => {},
  setEnableOptimizationSurface: () => {},
  updateSubViewSection: () => {},
  setCanvasViewport: () => {},
};

export const UserSettingsContext = createContext<UserSettingsContextValue>(
  DEFAULT_CONTEXT_VALUE,
);
