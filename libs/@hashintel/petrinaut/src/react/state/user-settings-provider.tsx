import { use, useEffect, useState } from "react";

import { usePublished } from "../shared/select-from-context";
import {
  createPlainSettingSetters,
  defaultUserSettings,
  defaultUserSettingsContextValue,
  UserSettingsContext,
  UserSettingsPublishedContext,
} from "./user-settings-context";
import { rememberCanvasViewport } from "./user-settings-provider/remember-canvas-viewport";

import type { CanvasViewport } from "./canvas-viewport-context";
import type {
  SubViewSectionSettings,
  UserSettings,
} from "./user-settings-context";

const STORAGE_KEY = "petrinaut:user-settings";

/** The persisted blob, including keys no longer part of `UserSettings`. */
type PersistedUserSettings = Partial<UserSettings> & {
  computeBackend?: "cpu" | "webgpu";
  webGpuEnabled?: boolean;
  enableParameterSweeps?: boolean;
  enableInBrowserOptimization?: boolean;
  /**
   * Chose between the entities tree and a stack of lists in the left panel.
   * The tree is the only rendering, so the key is dropped on the next write.
   */
  useEntitiesTreeView?: boolean;
  /**
   * Toggled the study drawer's locally computed objective surface, which
   * went with the Optimizations tab. Dropped on the next write.
   */
  enableOptimizationSurface?: boolean;
  /**
   * Gated the scenario form while it was experimental. The form is the only
   * scenario form, so the key is dropped on the next write.
   */
  enableAdHocScenarios?: boolean;
  enableNotebookView?: boolean;
  /** Showed a host's Brunch demo affordances. Dropped on the next write. */
  brunchDemoMode?: boolean;
  /** Opened the built-in welcome guide on init. Dropped on the next write. */
  showWalkthroughOnInit?: boolean;
  /**
   * Gated arcs drawn through node outlines while they were experimental.
   * They are the only arcs, so the key is dropped on the next write.
   */
  enableAutomaticArcConnections?: boolean;
  /**
   * Chose the curve of arcs between fixed handles, which went with them.
   * Dropped on the next write.
   */
  arcRendering?: "smoothstep" | "bezier" | "custom";
  /**
   * Kept the closed panels mounted. A closed panel always unmounts, so the
   * key is dropped on the next write.
   */
  keepPanelsMounted?: boolean;
  /**
   * Switched the editor's icons to the default set of the design system. The
   * editor always draws its own set, so the key is dropped on the next write.
   */
  enableExperimentalIconPack?: boolean;
};

const loadSettings = (): UserSettings => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      // Destructured rather than read through the spread, so the dead key is
      // dropped from storage on the next write instead of persisting forever.
      const {
        computeBackend: _computeBackend,
        webGpuEnabled: _webGpuEnabled,
        enableParameterSweeps: _enableParameterSweeps,
        enableInBrowserOptimization: _enableInBrowserOptimization,
        useEntitiesTreeView: _useEntitiesTreeView,
        enableOptimizationSurface: _enableOptimizationSurface,
        enableAdHocScenarios: _enableAdHocScenarios,
        enableNotebookView: _enableNotebookView,
        brunchDemoMode: _brunchDemoMode,
        showWalkthroughOnInit: _showWalkthroughOnInit,
        enableAutomaticArcConnections: _enableAutomaticArcConnections,
        arcRendering: _arcRendering,
        keepPanelsMounted: _keepPanelsMounted,
        enableExperimentalIconPack: _enableExperimentalIconPack,
        ...parsed
      } = JSON.parse(raw) as PersistedUserSettings;
      return {
        ...defaultUserSettings,
        ...parsed,
      };
    }
  } catch {
    // Ignore corrupted or unavailable localStorage
  }
  return defaultUserSettings;
};

const OwnedUserSettingsProvider: React.FC<React.PropsWithChildren> = ({
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

  const [plainSetters] = useState(() =>
    createPlainSettingSetters((key, value) =>
      setState((prev) => ({ ...prev, [key]: value })),
    ),
  );

  const contextValue = {
    ...state,
    ...plainSetters,
    setPluginEnabled: (pluginId: string, enabled: boolean) =>
      setState((prev) => ({
        ...prev,
        disabledPluginIds: [
          ...prev.disabledPluginIds.filter((id) => id !== pluginId),
          ...(enabled ? [] : [pluginId]),
        ],
      })),
    setAssistantPluginId: (pluginId: string) =>
      setState((prev) => ({ ...prev, assistantPluginId: pluginId })),
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

  const published = usePublished(contextValue);

  return (
    <UserSettingsPublishedContext value={published}>
      <UserSettingsContext value={contextValue}>{children}</UserSettingsContext>
    </UserSettingsPublishedContext>
  );
};

/**
 * Provides the persisted user settings. A host may mount it above
 * `Petrinaut` to share the settings with its own components; the editor's
 * own instance then reuses that ancestor, so one state owns the storage key.
 */
export const UserSettingsProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const ancestor = use(UserSettingsContext);
  return ancestor === defaultUserSettingsContextValue ? (
    <OwnedUserSettingsProvider>{children}</OwnedUserSettingsProvider>
  ) : (
    children
  );
};
