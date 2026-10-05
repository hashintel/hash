/**
 * Which plugin's assistant the editor shows: the chosen one while it is
 * passed to the editor, otherwise the first assistant provider, otherwise
 * none. A stale choice falls back without being cleared, so it applies again
 * once its plugin is back. Pure, so the plugin hosts and the editor agree.
 */

import type { PetrinautPluginManifest } from "./plugin-manifest";

type AssistantProviderManifest = PetrinautPluginManifest & {
  readonly assistant: { readonly label: string };
};

type AssistantExtensionManifest = PetrinautPluginManifest & {
  readonly assistant: { readonly extends: string };
};

export const isAssistantProvider = (
  manifest: PetrinautPluginManifest,
): manifest is AssistantProviderManifest =>
  manifest.assistant !== undefined && "label" in manifest.assistant;

export const isAssistantExtension = (
  manifest: PetrinautPluginManifest,
): manifest is AssistantExtensionManifest =>
  manifest.assistant !== undefined && "extends" in manifest.assistant;

export const resolveActiveAssistantId = (
  manifests: readonly PetrinautPluginManifest[],
  chosenPluginId: string | null,
): string | undefined => {
  const providers = manifests.filter(isAssistantProvider);

  return (
    providers.find(({ id }) => id === chosenPluginId)?.id ?? providers[0]?.id
  );
};

/** Whether the editor shows the assistant this plugin provides or extends. */
export const isAssistantShownFor = (
  manifest: PetrinautPluginManifest,
  activeAssistantId: string | undefined,
): boolean =>
  activeAssistantId !== undefined &&
  (isAssistantProvider(manifest)
    ? manifest.id === activeAssistantId
    : isAssistantExtension(manifest) &&
      manifest.assistant.extends === activeAssistantId);
