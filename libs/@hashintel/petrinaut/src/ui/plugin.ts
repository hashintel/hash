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
  PluginDocumentReader,
  PluginEditor,
  PluginEditorReader,
  PluginEdits,
  PluginErrors,
  PluginExperiments,
  PluginExperimentsReader,
  PluginNotifications,
} from "./plugins/plugin-access";
export { usePluginService } from "./plugins/plugins-provider";
export {
  AssistantPanelTitle,
  pickAssistant,
  useAssistantPanel,
} from "./plugins/plugin-assistant";
export type { AssistantPanel } from "./plugins/plugin-assistant";
export {
  useCommand,
  useCommandRegistry,
  useCommands,
} from "../react/commands/command-registry";
export { useStore, useStoreSelector } from "../react/use-store";
export type { PetrinautRevealTarget } from "../react/hooks/use-reveal-in-editor";
export type { AddNotificationInput } from "../react/notifications/context";
export type { ReadOnlyReason } from "../react/state/use-read-only-reason";
export { parseDocumentUri } from "@hashintel/petrinaut-core";
export type {
  DiagnosticsSnapshot,
  ReadableStore,
  SelectionItem,
} from "@hashintel/petrinaut-core";
