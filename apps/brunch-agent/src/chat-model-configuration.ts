import { createModels } from "@earendil-works/pi-ai";

import { brunchEnv } from "@hashintel/brunch-agent";

import { selectChatModelSpecifier } from "./chat-model.ts";

import type { Api, Model, ModelAuth, Provider } from "@earendil-works/pi-ai";

/** Outcomes that let the server start; definitive problems throw instead. */
export type ChatModelVerification =
  | { readonly verified: true; readonly shutdownDate?: string }
  | { readonly verified: false; readonly reason: string };

const lookupTimeoutMs = 10_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/**
 * The provider's free model-metadata request, authenticated as a chat turn
 * would be. It runs no inference, so it proves the credential and the model's
 * availability to it, but not permission to generate.
 */
const modelLookup = (
  model: Model<Api>,
  auth: ModelAuth,
): { readonly url: string; readonly headers: Headers } | undefined => {
  const baseUrl = (auth.baseUrl ?? model.baseUrl).replace(/\/$/u, "");
  const headers = new Headers();
  for (const [name, value] of Object.entries(auth.headers ?? {})) {
    if (value !== null) headers.set(name, value);
  }
  const modelPath = `models/${encodeURIComponent(model.id)}`;
  if (model.api === "openai-responses") {
    if (auth.apiKey) headers.set("authorization", `Bearer ${auth.apiKey}`);
    return { url: `${baseUrl}/${modelPath}`, headers };
  }
  // pi-ai sends Anthropic OAuth tokens with Claude Code identity headers; only
  // plain API keys have a lookup this module can reproduce faithfully.
  if (
    model.api === "anthropic-messages" &&
    auth.apiKey &&
    !auth.apiKey.includes("sk-ant-oat")
  ) {
    headers.set("x-api-key", auth.apiKey);
    headers.set("anthropic-version", "2023-06-01");
    return { url: `${baseUrl}/v1/${modelPath}`, headers };
  }
  return undefined;
};

/**
 * Only responses that no retry or later permission change could make usable
 * refuse startup. Missing scopes and transient failures leave it unverified.
 */
const definitiveRejection = async (
  response: Response,
): Promise<string | undefined> => {
  if (response.status === 404) {
    return "the provider does not offer this model to this credential";
  }
  if (response.status !== 401) return undefined;
  const body: unknown = await response.json().catch(() => undefined);
  const error = isRecord(body) && isRecord(body.error) ? body.error : {};
  return error.code === "invalid_api_key" ||
    error.type === "authentication_error"
    ? "the provider rejected the credential"
    : undefined;
};

/**
 * Resolve the selected chat model and its credential as a chat turn does,
 * then ask the provider whether that credential may use the model. A
 * deployment that lacks either, or whose credential the provider rejects,
 * throws instead of failing every chat. Messages never include a credential.
 */
export const verifyChatModel = async (
  providers: readonly Provider[],
  fetchMetadata: typeof fetch = fetch,
): Promise<ChatModelVerification> => {
  const specifier = selectChatModelSpecifier();
  const slash = specifier.indexOf("/");
  const providerId = specifier.slice(0, slash);
  const models = createModels();
  for (const provider of providers) models.setProvider(provider);
  const model = models.getModel(providerId, specifier.slice(slash + 1));
  if (!model) {
    throw new Error(
      `Chat model "${specifier}" is not declared by a registered provider (${providers.map((provider) => provider.id).join(", ")}). Check ${brunchEnv.chatModel}.`,
    );
  }
  const auth = await models.getAuth(model);
  if (!auth) {
    throw new Error(
      `Chat model "${specifier}" has no credential: provider "${providerId}" is not configured. Supply its API key (see the production environment table in apps/brunch-agent/README.md).`,
    );
  }

  const lookup = modelLookup(model, auth.auth);
  if (!lookup) return { verified: false, reason: "unsupported-credential" };
  let response: Response;
  try {
    response = await fetchMetadata(lookup.url, {
      headers: lookup.headers,
      signal: AbortSignal.timeout(lookupTimeoutMs),
    });
  } catch {
    return { verified: false, reason: "provider-unreachable" };
  }
  if (response.ok) {
    const body: unknown = await response.json().catch(() => undefined);
    const shutdownDate =
      isRecord(body) && typeof body.shutdown_date === "string"
        ? body.shutdown_date
        : undefined;
    return { verified: true, ...(shutdownDate ? { shutdownDate } : {}) };
  }
  const rejection = await definitiveRejection(response);
  if (rejection) {
    throw new Error(
      `Chat model "${specifier}" is unusable: ${rejection} (HTTP ${response.status}). Check the provider "${providerId}" credential and ${brunchEnv.chatModel}.`,
    );
  }
  if (!response.bodyUsed) await response.body?.cancel();
  return { verified: false, reason: `http-${response.status}` };
};
