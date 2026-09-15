import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

import * as v from "valibot";

import { PERSONA_DEFAULT_PERSONA_MODEL } from "../../chat-model.ts";

const fail = (): never => {
  throw new Error(
    "Persona configuration refused; values withheld; check the isolated Pi configuration.",
  );
};
const settingsSchema = v.object({
  retry: v.strictObject({
    enabled: v.literal(false),
    provider: v.strictObject({ maxRetries: v.literal(0) }),
  }),
  compaction: v.optional(v.strictObject({ enabled: v.boolean() })),
});

/** Check the isolated Pi configuration before launch; never search another credential store. */
export const checkPersonaConfiguration = (
  environment: NodeJS.ProcessEnv = process.env,
  model = PERSONA_DEFAULT_PERSONA_MODEL,
) => {
  try {
    const directory = environment.PI_CODING_AGENT_DIR;
    if (!directory || !isAbsolute(directory) || environment.PI_OFFLINE !== "1")
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
      if (environment[name]) return fail();
    }
    const variable = model.startsWith("openai/")
      ? "OPENAI_API_KEY"
      : model.startsWith("anthropic/")
        ? "ANTHROPIC_API_KEY"
        : fail();
    const key = environment[variable];
    if (
      !key?.trim() ||
      /dummy|placeholder|test-synthetic|your[-_ ]?(api[-_ ]?)?key|changeme|replace[-_ ]?me/i.test(
        key,
      )
    )
      return fail();
    return { [variable]: key };
  } catch {
    return fail();
  }
};
