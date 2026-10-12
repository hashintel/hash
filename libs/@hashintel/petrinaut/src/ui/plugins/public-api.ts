/**
 * The plugin API as a host and plugin code import it: what `<Petrinaut
 * plugins>` takes and what plugin code reads. `@hashintel/petrinaut/ui` and
 * the package root both export this module, so the two cannot differ.
 */

export {
  definePetrinautPlugin,
  pluginCommandId,
  pluginService,
} from "./define-petrinaut-plugin";
export type {
  PetrinautPlugin,
  PetrinautPluginDefinition,
  PetrinautPluginManifest,
  PluginApi,
  PluginButton,
  PluginButtonPlace,
  PluginButtonSpec,
  PluginCommand,
  PluginCommandSpec,
  PluginContributions,
  PluginDefinitionRef,
  PluginHook,
  PluginImplementation,
  PluginService,
  PluginSettingSection,
  PluginSettingSpec,
  PluginTopBarItemSpec,
  PluginTopBarPlace,
  ServiceOf,
} from "./define-petrinaut-plugin";
export { describeRefusal } from "./plugin-access";
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
} from "./plugin-access";
export { usePluginService } from "./plugins-provider";
export {
  useCommand,
  useCommandRegistry,
  useCommands,
} from "../../react/commands/command-registry";
export { useStore, useStoreSelector } from "../../react/use-store";
export type { PetrinautRevealTarget } from "../../react/hooks/use-reveal-in-editor";
export type { AddNotificationInput } from "../../react/notifications/context";
export type { ReadOnlyReason } from "../../react/state/use-read-only-reason";
export { parseDocumentUri } from "@hashintel/petrinaut-core";
export type {
  DiagnosticsSnapshot,
  ReadableStore,
  SelectionItem,
} from "@hashintel/petrinaut-core";
