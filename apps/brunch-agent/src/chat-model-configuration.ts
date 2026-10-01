import { createModels, type Provider } from "@earendil-works/pi-ai";

import { brunchEnv } from "@hashintel/brunch-agent";

import { selectChatModelSpecifier } from "./chat-model.ts";

/**
 * Resolve the selected chat model and its provider credential from the
 * process environment, as a chat turn does. A deployment that lacks either
 * then fails to start instead of failing every chat with
 * `Provider is not configured`. Messages name the provider, never a value.
 */
export const assertChatModelConfigured = async (
  providers: readonly Provider[],
): Promise<void> => {
  const specifier = selectChatModelSpecifier();
  const slash = specifier.indexOf("/");
  const providerId = specifier.slice(0, slash);
  const models = createModels();
  for (const provider of providers) models.setProvider(provider);
  const model = models.getModel(providerId, specifier.slice(slash + 1));
  if (!model)
    throw new Error(
      `Chat model "${specifier}" is not declared by a registered provider (${providers.map((provider) => provider.id).join(", ")}). Check ${brunchEnv.chatModel}.`,
    );
  if (!(await models.getAuth(model)))
    throw new Error(
      `Chat model "${specifier}" has no credential: provider "${providerId}" is not configured. Supply its API key (see the production environment table in apps/brunch-agent/README.md).`,
    );
};
