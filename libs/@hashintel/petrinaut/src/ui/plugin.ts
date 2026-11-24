/**
 * Public surface for `@hashintel/petrinaut/ui/plugin`: what `<Petrinaut
 * plugins>` takes and what plugin code imports.
 */

export {
  definePetrinautPlugin,
  pluginCommandId,
  pluginService,
} from "./plugins/define-petrinaut-plugin";
export type {
  PetrinautPlugin,
  PetrinautPluginDefinition,
  PetrinautPluginManifest,
  PluginApi,
  PluginAssistant,
  PluginBottomPanelView,
  PluginBottomPanelViewSpec,
  PluginButton,
  PluginButtonPlace,
  PluginButtonSpec,
  PluginCommand,
  PluginCommandSpec,
  PluginContributions,
  PluginDefinitionRef,
  PluginHook,
  PluginImplementation,
  PluginReadOnlyAction,
  PluginService,
  PluginSettingSection,
  PluginSettingSpec,
  PluginTopBarItemSpec,
  PluginTopBarPlace,
  ServiceOf,
} from "./plugins/define-petrinaut-plugin";
export { describeRefusal } from "./plugins/plugin-access";
export type {
  AccessApi,
  EditRefusal,
  EditResult,
  PluginAccess,
  PluginDiagnostics,
  PluginDocument,
  PluginDocumentHandle,
  PluginDocumentReader,
  PluginEditor,
  PluginEditorReader,
  PluginEdits,
  PluginErrors,
  PluginExperiments,
  PluginExperimentsReader,
  PluginNotifications,
} from "./plugins/plugin-access";
export { usePluginService } from "./plugins/running-plugins";
export { AssistantPanelTitle } from "./plugins/assistant-panel-title";
export { useAssistantPanel } from "./plugins/plugin-assistant";
export type { AssistantPanel } from "./plugins/plugin-assistant";
export {
  useCommand,
  useCommandRegistry,
  useCommands,
} from "../react/commands/command-registry";
export { useStore, useStoreSelector } from "../react/shared/use-store";
export type { PetrinautRevealTarget } from "../react/state/use-reveal-in-editor";
export type { AddNotificationInput } from "../react/notifications/context";
export type { ReadOnlyReason } from "../react/editing/use-read-only-reason";
export { parseDocumentUri } from "@hashintel/petrinaut-core";
export type {
  DiagnosticsSnapshot,
  DocChangeEvent,
  PetrinautPatch,
  ReadableStore,
  SelectionItem,
} from "@hashintel/petrinaut-core";
