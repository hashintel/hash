/** Fresh `yarn dev:brunch:server` configuration only. Never import app.ts or start Vite. */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseEnv } from "node:util";

import { selectChatModel, STEP_A_MODEL_ID } from "./chat-model.ts";

const expectedModel = `anthropic/${STEP_A_MODEL_ID}`;
const envFiles = [
  ".env",
  ".env.local",
  ".env.development",
  ".env.development.local",
];
const authVariables = [
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_OAUTH_TOKEN",
  "ANTHROPIC_API_KEY",
];
const checkedVariables = [...authVariables, "BRUNCH_CHAT_MODEL"];
const defaultRoot = fileURLToPath(new URL("../../../", import.meta.url));

const credentialStatus = (value: string | undefined) => {
  if (!value?.trim()) return "missing/empty";
  if (
    /dummy|placeholder|test-synthetic|your[-_ ]?(api[-_ ]?)?key|changeme|replace[-_ ]?me/i.test(
      value,
    )
  ) {
    return "placeholder rejected";
  }
  return "non-placeholder; validity untested";
};

/** repoRoot is injectable only for synthetic fixtures, not a credential search path. */
export const checkDevConfiguration = async (repoRoot = defaultRoot) => {
  // Vite's DEBUG output includes resolved values. Fail before importing the loader.
  if (process.env.DEBUG)
    throw new Error(
      "Preflight requires DEBUG unset or empty; values withheld.",
    );
  const { loadEnv } = await import("vite");
  const { createModels } = await import("@earendil-works/pi-ai");
  const { anthropicProvider } =
    await import("@earendil-works/pi-ai/providers/anthropic");
  const appDirectory = join(repoRoot, "apps/brunch-agent");
  const declarations = new Map<string, string>();
  const files = envFiles.map((name) => {
    const path = join(appDirectory, name);
    const present = existsSync(path);
    if (present) {
      // Same Node parser as installed Vite. Only declaration provenance; Vite owns expansion/resolution.
      const parsed = parseEnv(readFileSync(path, "utf8"));
      for (const variable of checkedVariables) {
        if (Object.hasOwn(parsed, variable))
          declarations.set(variable, `apps/brunch-agent/${name}`);
      }
    }
    return { path: `apps/brunch-agent/${name}`, present };
  });
  const rootFiles = envFiles.map((name) => ({
    path: name,
    present: existsSync(join(repoRoot, name)),
    selection: "not loaded by dev server",
  }));
  const source = (variable: string) =>
    process.env[variable] !== undefined
      ? "process environment"
      : (declarations.get(variable) ?? "absent");
  const apiKeySource = source("ANTHROPIC_API_KEY");
  const modelSource = source("BRUNCH_CHAT_MODEL");
  // Flue applyDevEnv uses loadEnv('development', server.config.envDir, '') and shell-wins injection.
  // Restrict returned variables here; parsing and interpolation still use Vite's actual loader.
  const environment = loadEnv("development", appDirectory, checkedVariables);
  const selectedModel = selectChatModel(environment);
  const models = createModels();
  models.setProvider(anthropicProvider());
  const knownModel = models.getModel("anthropic", selectedModel);
  const model = knownModel
    ? `anthropic/${knownModel.id}`
    : "unrecognized model; value withheld";
  const apiKey = credentialStatus(environment.ANTHROPIC_API_KEY);
  const higherPrioritySources = authVariables
    .slice(0, 2)
    .filter((variable) => Boolean(environment[variable]?.trim()))
    .map((variable) => ({ variable, source: source(variable) }));
  let providerSelection =
    "incomplete; higher-priority source present; alternate credential not resolved";
  if (higherPrioritySources.length === 0) {
    // Installed Flue creates Models with defaults (empty in-memory credentials, process-env context).
    // Its Anthropic API-key resolver only consults these three env vars: no I/O/request/refresh.
    // Do not use Pi CLI credential stores. Mirror Flue's shell-wins injection for this call only.
    const previous = new Map(
      authVariables.map((variable) => [variable, process.env[variable]]),
    );
    try {
      for (const variable of authVariables) {
        if (
          process.env[variable] === undefined &&
          environment[variable] !== undefined
        ) {
          process.env[variable] = environment[variable];
        }
      }
      const auth = await models.getAuth("anthropic");
      providerSelection =
        auth?.source === "ANTHROPIC_API_KEY" &&
        auth.auth.apiKey === environment.ANTHROPIC_API_KEY
          ? "verified: ANTHROPIC_API_KEY matches Vite selection"
          : "incomplete; provider did not select ANTHROPIC_API_KEY";
    } finally {
      for (const [variable, value] of previous) {
        if (value === undefined) delete process.env[variable];
        else process.env[variable] = value;
      }
    }
  }
  const failures: string[] = [];
  if (apiKey !== "non-placeholder; validity untested")
    failures.push(`ANTHROPIC_API_KEY: ${apiKey}`);
  if (!providerSelection.startsWith("verified:"))
    failures.push("credential-source verification incomplete");
  if (model !== expectedModel) failures.push("model mismatch");
  return {
    status: failures.length === 0 ? "PASS" : "FAIL",
    scope:
      "fresh yarn dev:brunch:server; development; apps/brunch-agent; process wins",
    files,
    rootFiles,
    localOverride: files.some(
      (file) => file.present && file.path.endsWith(".local"),
    )
      ? "present"
      : "absent",
    apiKey: { source: apiKeySource, status: apiKey },
    provenance:
      "File sources identify declarations; Vite owns interpolation. Root env contents not read.",
    providerSelection,
    higherPrioritySources,
    model: {
      source: environment.BRUNCH_CHAT_MODEL
        ? modelSource
        : "ChatAgent default (BRUNCH_CHAT_MODEL absent or empty)",
      actual: model,
      expected: expectedModel,
    },
    failures,
    result:
      failures.length === 0
        ? "configuration verified; credential validity untested"
        : "configuration NOT verified; credential validity untested",
    persona:
      "UNVERIFIED separate participant gate: persona CLI model and authentication are not configured by the Brunch extension",
    paidExecution:
      "configuration check grants no paid execution; consult the current mission and shared accounting authority",
  };
};

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    const report = await checkDevConfiguration();
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = report.status === "PASS" ? 0 : 1;
  } catch {
    // Never surface loader/provider exceptions: they may contain configuration values.
    process.stderr.write(
      "FAIL: configuration preflight could not complete; details withheld; credential validity untested. Ensure DEBUG is unset.\n",
    );
    process.exitCode = 1;
  }
}
