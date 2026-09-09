import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

// Pi exposes this public entrypoint as a host module to extensions; use its
// native implementation rather than resolving a workspace-only provider subpath.
import { builtinProviders } from "@earendil-works/pi-ai/providers/all";
import * as v from "valibot";

import { createStepARequestAccounting } from "../../provider-accounting.ts";

import type { Api, AuthResult, Model, Provider } from "@earendil-works/pi-ai";

export interface PersonaAccountingContext {
  model: Model<Api> | undefined;
  sessionManager: { getSessionId(): string };
  modelRegistry: {
    getProviderAuth(provider: string): Promise<AuthResult | undefined>;
  };
}
export interface PersonaAccountingApi {
  registerProvider(provider: Provider): void;
  on(
    event: "session_start",
    handler: (
      event: unknown,
      context: PersonaAccountingContext,
    ) => Promise<void>,
  ): void;
}
const fail = (): never => {
  throw new Error(
    "Persona accounting configuration refused; values withheld; no inference authorized.",
  );
};
const settingsSchema = v.object({
  retry: v.strictObject({
    enabled: v.literal(false),
    provider: v.strictObject({ maxRetries: v.literal(0) }),
  }),
  compaction: v.optional(v.strictObject({ enabled: v.boolean() })),
});

/** Dedicated operator-created configuration only; never search another credential store.
 * This is also rechecked before native invocation/dispatch. Pi's own startup must use
 * this fresh directory so native auth cannot refresh a stored OAuth credential first.
 */
export const checkPersonaConfiguration = () => {
  try {
    const directory = process.env.PI_CODING_AGENT_DIR;
    if (!directory || !isAbsolute(directory) || process.env.PI_OFFLINE !== "1")
      return fail();
    // Pi itself writes models-store.json during offline startup. It is not a
    // user override; the operator must start with a fresh directory, not copy it.
    if (existsSync(join(directory, "models.json"))) return fail();
    const authPath = join(directory, "auth.json");
    if (existsSync(authPath))
      v.parse(v.strictObject({}), JSON.parse(readFileSync(authPath, "utf8")));
    const settings: unknown = JSON.parse(
      readFileSync(join(directory, "settings.json"), "utf8"),
    );
    v.parse(settingsSchema, settings);
    if (
      typeof settings !== "object" ||
      settings === null ||
      ["httpProxy", "packages", "extensions"].some((key) => key in settings)
    )
      return fail();
    for (const name of [
      "ANTHROPIC_AUTH_TOKEN",
      "ANTHROPIC_OAUTH_TOKEN",
      "ANTHROPIC_BASE_URL",
      "HTTP_PROXY",
      "HTTPS_PROXY",
      "ALL_PROXY",
      "DEBUG",
    ]) {
      if (process.env[name]) return fail();
    }
    const key = process.env.ANTHROPIC_API_KEY;
    if (
      !key?.trim() ||
      /dummy|placeholder|test-synthetic|your[-_ ]?(api[-_ ]?)?key|changeme|replace[-_ ]?me/i.test(
        key,
      )
    )
      return fail();
    return key;
  } catch {
    return fail();
  }
};

/** Uses Pi's native provider registration, not another agent loop or usage authority. */
export const registerPersonaAccounting = (pi: PersonaAccountingApi) => {
  const configuration = process.env.BRUNCH_STEP_A_ACCOUNTING;
  if (configuration === undefined) return;
  let sessionId: string | undefined;
  let intendedKey: string | undefined;
  // Construction errors must not leave an unmetered native provider available.
  let accounting: ReturnType<typeof createStepARequestAccounting>;
  try {
    accounting = createStepARequestAccounting(configuration, () => {
      if (!sessionId) return fail();
      return { kind: "pi", sessionId, requestId: randomUUID() };
    });
  } catch {
    accounting = undefined;
  }
  const native = builtinProviders().find(
    (provider) => provider.id === "anthropic",
  );
  if (!native) return fail();
  const verify = (model: Model<Api>, options?: { apiKey?: string }) => {
    if (
      !sessionId ||
      !intendedKey ||
      checkPersonaConfiguration() !== intendedKey ||
      model.provider !== "anthropic" ||
      model.id !== "claude-sonnet-4-6" ||
      model.api !== "anthropic-messages" ||
      model.baseUrl !== "https://api.anthropic.com" ||
      options?.apiKey !== intendedKey
    )
      return fail();
  };
  pi.registerProvider(
    accounting
      ? accounting.wrap(native, () => true, verify)
      : { ...native, stream: fail, streamSimple: fail },
  );
  pi.on("session_start", async (_event, context) => {
    sessionId = undefined;
    intendedKey = undefined;
    const key = checkPersonaConfiguration();
    if (
      !accounting ||
      context.model?.provider !== "anthropic" ||
      context.model.id !== "claude-sonnet-4-6"
    )
      return fail();
    const auth = await context.modelRegistry.getProviderAuth("anthropic");
    if (auth?.source !== "ANTHROPIC_API_KEY" || auth.auth.apiKey !== key)
      return fail();
    intendedKey = key;
    sessionId = context.sessionManager.getSessionId();
  });
};
