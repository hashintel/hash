import { useEffect, useState } from "react";

import {
  defaultUserSettings,
  UserSettingsContext,
} from "./user-settings-context";
import { rememberCanvasViewport } from "./user-settings-provider/remember-canvas-viewport";

import type { CanvasViewport } from "./canvas-viewport-context";
import type {
  BottomPanelTab,
  CursorMode,
  TimelineChartType,
} from "./editor-context";
import type {
  ArcRendering,
  CanvasRendererName,
  SubViewSectionSettings,
  UserSettings,
} from "./user-settings-context";

const STORAGE_KEY = "petrinaut:user-settings";

/** The persisted blob, including keys no longer part of `UserSettings`. */
type PersistedUserSettings = Partial<UserSettings> & {
  /**
   * Replaced by `webGpuEnabled` when the backend became a per-experiment choice.
   * Still present in blobs written before that.
   */
  computeBackend?: "cpu" | "webgpu";
};

const loadSettings = (): UserSettings => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      // Destructured rather than read through the spread, so the dead key is
      // dropped from storage on the next write instead of persisting forever.
      const { computeBackend, ...parsed } = JSON.parse(
        raw,
      ) as PersistedUserSettings;
      return {
        ...defaultUserSettings,
        ...parsed,
        // Someone who had selected the GPU globally keeps it available.
        webGpuEnabled: parsed.webGpuEnabled ?? computeBackend === "webgpu",
      };
    }
  } catch {
    // Ignore corrupted or unavailable localStorage
  }
  return defaultUserSettings;
};

export const UserSettingsProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const [state, setState] = useState<UserSettings>(loadSettings);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore write failures (e.g. quota exceeded)
    }
  }, [state]);

  const contextValue = {
    ...state,
    setShowAnimations: (value: boolean) =>
      setState((prev) => ({ ...prev, showAnimations: value })),
    setKeepPanelsMounted: (value: boolean) =>
      setState((prev) => ({ ...prev, keepPanelsMounted: value })),
    setCompactNodes: (value: boolean) =>
      setState((prev) => ({ ...prev, compactNodes: value })),
    setArcRendering: (value: ArcRendering) =>
      setState((prev) => ({ ...prev, arcRendering: value })),
    setCanvasRenderer: (value: CanvasRendererName) =>
      setState((prev) => ({ ...prev, canvasRenderer: value })),
    setCursorMode: (value: CursorMode) =>
      setState((prev) => ({ ...prev, cursorMode: value })),
    setIsLeftSidebarOpen: (value: boolean) =>
      setState((prev) => ({ ...prev, isLeftSidebarOpen: value })),
    setLeftSidebarWidth: (value: number) =>
      setState((prev) => ({ ...prev, leftSidebarWidth: value })),
    setPropertiesPanelWidth: (value: number) =>
      setState((prev) => ({ ...prev, propertiesPanelWidth: value })),
    setIsBottomPanelOpen: (value: boolean) =>
      setState((prev) => ({ ...prev, isBottomPanelOpen: value })),
    setBottomPanelHeight: (value: number) =>
      setState((prev) => ({ ...prev, bottomPanelHeight: value })),
    setActiveBottomPanelTab: (value: BottomPanelTab) =>
      setState((prev) => ({ ...prev, activeBottomPanelTab: value })),
    setTimelineChartType: (value: TimelineChartType) =>
      setState((prev) => ({ ...prev, timelineChartType: value })),
    setShowMinimap: (value: boolean) =>
      setState((prev) => ({ ...prev, showMinimap: value })),
    setSnapToGrid: (value: boolean) =>
      setState((prev) => ({ ...prev, snapToGrid: value })),
    setPartialSelection: (value: boolean) =>
      setState((prev) => ({ ...prev, partialSelection: value })),
    setUseEntitiesTreeView: (value: boolean) =>
      setState((prev) => ({ ...prev, useEntitiesTreeView: value })),
    setEnableNetComponents: (value: boolean) =>
      setState((prev) => ({ ...prev, enableNetComponents: value })),
    setEnableNotebookView: (value: boolean) =>
      setState((prev) => ({ ...prev, enableNotebookView: value })),
    setEnableAdHocScenarios: (value: boolean) =>
      setState((prev) => ({ ...prev, enableAdHocScenarios: value })),
    setShowWalkthroughOnInit: (value: boolean) =>
      setState((prev) => ({ ...prev, showWalkthroughOnInit: value })),
    setWebGpuEnabled: (value: boolean) =>
      setState((prev) => ({ ...prev, webGpuEnabled: value })),
    setShowCompilationOutput: (value: boolean) =>
      setState((prev) => ({ ...prev, showCompilationOutput: value })),
    setEnableParameterSweeps: (value: boolean) =>
      setState((prev) => ({ ...prev, enableParameterSweeps: value })),
    setEnableOptimizationSurface: (value: boolean) =>
      setState((prev) => ({ ...prev, enableOptimizationSurface: value })),
    setCanvasViewport: (petriNetId: string, viewport: CanvasViewport) => {
      // Stamped out here: an updater runs more than once and has to be pure.
      const savedAt = Date.now();
      setState((prev) => ({
        ...prev,
        canvasViewports: rememberCanvasViewport(
          prev.canvasViewports,
          petriNetId,
          viewport,
          savedAt,
        ),
      }));
    },
    updateSubViewSection: (
      containerName: string,
      sectionId: string,
      update: Partial<SubViewSectionSettings>,
    ) =>
      setState((prev) => {
        const existing = prev.subViewPanels[containerName]?.[sectionId];
        const merged: SubViewSectionSettings = {
          collapsed: existing?.collapsed ?? false,
          ...update,
        };
        return {
          ...prev,
          subViewPanels: {
            ...prev.subViewPanels,
            [containerName]: {
              ...prev.subViewPanels[containerName],
              [sectionId]: merged,
            },
          },
        };
      }),
  };

  return (
    <UserSettingsContext value={contextValue}>{children}</UserSettingsContext>
  );
};
