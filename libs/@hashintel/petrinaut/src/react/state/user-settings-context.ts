import { createContext } from "react";

import {
  useSelected,
  useSelectedFields,
  type Published,
} from "../select-from-context";
import { defaultPanelSizes } from "./panel-sizes";

import type {
  CanvasViewport,
  SavedCanvasViewport,
} from "./canvas-viewport-context";
import type {
  BottomPanelTab,
  CursorMode,
  TimelineChartType,
} from "./editor-context";

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
   * Shows the Compilation tab in the bottom panel, which reports how the net's
   * user code lowered to HIR and what the GPU backend can take.
   *
   * Off by default: it explains the compiler rather than the model, so it is
   * only useful when you are debugging why something did not compile.
   */
  showCompilationOutput: boolean;
  /** Plugins the user switched off in the Plugins section, by id. */
  disabledPluginIds: readonly string[];
  /**
   * The plugin whose assistant the user chose, by id. While it is not
   * running, the editor shows the assistant of the first running plugin that
   * provides one.
   */
  assistantPluginId: string | null;
  subViewPanels: SubViewPanelsSettings;
  /** Where each document's canvas was last left, keyed by document id. */
  canvasViewports: Record<string, SavedCanvasViewport>;
};

/**
 * The settings that change whole. Each has a setter named after it:
 * `showMinimap` is changed by `setShowMinimap`.
 */
const plainSettingKeys = [
  "showAnimations",
  "keepPanelsMounted",
  "compactNodes",
  "enableExperimentalIconPack",
  "cursorMode",
  "isLeftSidebarOpen",
  "leftSidebarWidth",
  "propertiesPanelWidth",
  "isBottomPanelOpen",
  "bottomPanelHeight",
  "activeBottomPanelTab",
  "timelineChartType",
  "showMinimap",
  "snapToGrid",
  "highlightOnHover",
  "partialSelection",
  "enableNetComponents",
  "showCompilationOutput",
] as const satisfies (keyof UserSettings)[];

type PlainSettingKey = (typeof plainSettingKeys)[number];

type PlainSettingSetters = {
  [Key in PlainSettingKey as `set${Capitalize<Key>}`]: (
    value: UserSettings[Key],
  ) => void;
};

/** The setter of every plain setting, each writing through `set`. */
export const createPlainSettingSetters = (
  set: <Key extends PlainSettingKey>(
    key: Key,
    value: UserSettings[Key],
  ) => void,
): PlainSettingSetters =>
  Object.fromEntries(
    plainSettingKeys.map((key) => [
      `set${key.charAt(0).toUpperCase()}${key.slice(1)}`,
      (value: UserSettings[typeof key]) => set(key, value),
    ]),
  ) as PlainSettingSetters;

export type UserSettingsActions = PlainSettingSetters & {
  setPluginEnabled: (pluginId: string, enabled: boolean) => void;
  setAssistantPluginId: (pluginId: string) => void;
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
  cursorMode: "pan",
  isLeftSidebarOpen: true,
  leftSidebarWidth: defaultPanelSizes.leftSidebarWidth,
  propertiesPanelWidth: defaultPanelSizes.propertiesPanelWidth,
  isBottomPanelOpen: false,
  bottomPanelHeight: defaultPanelSizes.bottomPanelHeight,
  activeBottomPanelTab: "diagnostics",
  timelineChartType: "run",
  showMinimap: true,
  snapToGrid: true,
  highlightOnHover: true,
  partialSelection: true,
  enableNetComponents: false,
  showCompilationOutput: false,
  disabledPluginIds: [],
  assistantPluginId: null,
  subViewPanels: {},
  canvasViewports: {},
};

/**
 * The value outside any provider. `UserSettingsProvider` compares against it
 * to tell whether an ancestor already provides the settings.
 */
export const defaultUserSettingsContextValue: UserSettingsContextValue = {
  ...defaultUserSettings,
  ...createPlainSettingSetters(() => {}),
  setPluginEnabled: () => {},
  setAssistantPluginId: () => {},
  updateSubViewSection: () => {},
  setCanvasViewport: () => {},
};

export const UserSettingsContext = createContext<UserSettingsContextValue>(
  defaultUserSettingsContextValue,
);

/** Where the settings provider publishes the context value for {@link useUserSettings}. */
export const UserSettingsPublishedContext =
  createContext<Published<UserSettingsContextValue>>(null);

/**
 * One setting, or one of the functions that change them. The reader renders
 * when that part changes.
 *
 * The settings hold what the editor saves as it is used: which panels are
 * open, their sizes, the canvas viewport. `use(UserSettingsContext)` renders
 * its reader each time any of them is saved. A component with many
 * components below it, or one of many like it, reads the settings it needs
 * through this hook instead.
 *
 * ```tsx
 * const compactNodes = useUserSettings((settings) => settings.compactNodes);
 * ```
 */
export const useUserSettings = <Selected>(
  select: (settings: UserSettingsContextValue) => Selected,
): Selected =>
  useSelected(UserSettingsContext, UserSettingsPublishedContext, select);

/**
 * Several settings, or functions that change them, by name. The reader
 * renders when one of them changes.
 *
 * ```tsx
 * const { compactNodes, showMinimap } = useUserSettingsFields("compactNodes", "showMinimap");
 * ```
 */
export const useUserSettingsFields = <
  Key extends keyof UserSettingsContextValue,
>(
  ...keys: Key[]
): Pick<UserSettingsContextValue, Key> =>
  useSelectedFields(UserSettingsContext, UserSettingsPublishedContext, keys);
