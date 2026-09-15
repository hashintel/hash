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
  /**
   * Whether resting the pointer on a node highlights its neighbourhood.
   * Off, the canvas answers only to the selection.
   */
  highlightOnHover: boolean;
  partialSelection: boolean;
  enableNetComponents: boolean;
  enableNotebookView: boolean;
  /**
   * Experimental: derive per-instance statuses from the net. On, the Simulate
   * panel gains a Status views tab, a token type's attributes offer an
   * identity to key instances by, a net with status views gets a Kanban board
   * toggle above the canvas, and Actual mode's Events tab gains a status
   * changes column. Off, none of those show; a document's identities and
   * status views are kept and still round-trip through import and export.
   */
  enableStatusViews: boolean;
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
   * Experimental: offer parameter sweeps. On, every numeric value of the
   * experiment form gets an interval toggle — reading Sweep, or Optimize when
   * In-browser optimization is on — that turns its value into an interval.
   * Off, experiments take fixed values only.
   */
  enableParameterSweeps: boolean;
  /**
   * Experimental: connect a host-supplied in-browser optimizer. On, the
   * experiment form's interval toggles read Optimize: creating the experiment
   * starts a study over the selected intervals, with an Objective and
   * Constraints chosen in the form. Off, a connected optimizer counts as none
   * at all, the toggles read Sweep and the sweep waits for a selection; any
   * running in-browser optimization is cancelled. A remote optimization
   * capability is unaffected either way.
   */
  enableInBrowserOptimization: boolean;
  /**
   * Shows a host's Brunch demo affordances, such as the demo site's
   * prepared-fixture selector. Toggled from a palette command the host
   * registers; the settings dialog has no control for it.
   */
  brunchDemoMode: boolean;
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
  setHighlightOnHover: (value: boolean) => void;
  setPartialSelection: (value: boolean) => void;
  setEnableNetComponents: (value: boolean) => void;
  setEnableNotebookView: (value: boolean) => void;
  setEnableStatusViews: (value: boolean) => void;
  setShowWalkthroughOnInit: (value: boolean) => void;
  setWebGpuEnabled: (value: boolean) => void;
  setShowCompilationOutput: (value: boolean) => void;
  setEnableParameterSweeps: (value: boolean) => void;
  setEnableInBrowserOptimization: (value: boolean) => void;
  setBrunchDemoMode: (value: boolean) => void;
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
  highlightOnHover: true,
  partialSelection: true,
  enableNetComponents: false,
  enableNotebookView: false,
  enableStatusViews: false,
  showWalkthroughOnInit: true,
  webGpuEnabled: false,
  showCompilationOutput: false,
  enableParameterSweeps: false,
  enableInBrowserOptimization: false,
  brunchDemoMode: false,
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
  setEnableNotebookView: () => {},
  setEnableStatusViews: () => {},
  setShowWalkthroughOnInit: () => {},
  setWebGpuEnabled: () => {},
  setShowCompilationOutput: () => {},
  setEnableParameterSweeps: () => {},
  setEnableInBrowserOptimization: () => {},
  setBrunchDemoMode: () => {},
  updateSubViewSection: () => {},
  setCanvasViewport: () => {},
};

export const UserSettingsContext = createContext<UserSettingsContextValue>(
  defaultUserSettingsContextValue,
);
