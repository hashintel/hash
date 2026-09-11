import { readBrowserSessionOptions } from "../../src/evaluations/persona/browser-session.ts";
/**
 * Pi extension entry for the Brunch persona harness.
 *
 * Load it from `apps/brunch-agent` with
 * `--extension .pi/extensions/brunch-persona-testing.ts`; the persona policy
 * and operating instructions sit in the same-named folder beside this file.
 * This entry owns only Pi registration and flag handling. The tool lives in
 * `src/evaluations/persona/brunch-turn.ts` and the client-tool hosts in
 * `src/evaluations/persona/client-tool-hosts.ts`, where the application's
 * lint, type-check, and unit tests govern them.
 */
import {
  type BrunchTurnExtensionApi,
  registerBrunchTurn,
  requireConversationId,
} from "../../src/evaluations/persona/brunch-turn.ts";
import {
  type BrunchClientToolHost,
  createMockClientToolHost,
  createRealHeadlessClientToolHost,
  readMockCalls,
  TOOL_HOST_FLAG,
} from "../../src/evaluations/persona/client-tool-hosts.ts";
import { writeProofArtifacts } from "../../src/evaluations/persona/proof-artifacts.ts";
import {
  registerPersonaAccounting,
  type PersonaAccountingContext,
} from "../../src/evaluations/persona/request-accounting.ts";

import type { Provider } from "@earendil-works/pi-ai";

/** The slice of Pi's extension API this entry needs; Pi itself is not a workspace dependency. */
interface BrunchPersonaExtensionApi extends BrunchTurnExtensionApi {
  registerProvider(provider: Provider): void;
  registerFlag(
    name: string,
    options: {
      readonly description?: string;
      readonly type: "string";
      readonly default?: string;
    },
  ): void;
  getFlag(name: string): boolean | string | undefined;
  on(
    event: "session_start" | "session_shutdown",
    handler: (
      event: unknown,
      context: PersonaAccountingContext,
    ) => void | Promise<void>,
  ): void;
}

const TOOL_MOCKS_FLAG = "brunch-tool-mocks";
const HEADLESS_TITLE_FLAG = "brunch-headless-title";
const EVIDENCE_DIRECTORY_FLAG = "brunch-evidence-dir";
const BROWSER_SESSION_FLAG = "brunch-browser-session";

const stringFlag = (
  pi: BrunchPersonaExtensionApi,
  name: string,
): string | undefined => {
  const value = pi.getFlag(name);
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
};

const createConfiguredClientToolHost = (
  pi: BrunchPersonaExtensionApi,
): BrunchClientToolHost | undefined => {
  const mode = stringFlag(pi, TOOL_HOST_FLAG) ?? "none";
  if (mode === "none") return undefined;

  if (mode === "mock") {
    const fixturePath = stringFlag(pi, TOOL_MOCKS_FLAG);
    if (fixturePath === undefined) {
      throw new Error(
        `--${TOOL_MOCKS_FLAG} is required when --${TOOL_HOST_FLAG}=mock`,
      );
    }
    return createMockClientToolHost(readMockCalls(fixturePath));
  }

  if (mode === "real-headless") {
    const title =
      stringFlag(pi, HEADLESS_TITLE_FLAG) ??
      `Brunch persona ${requireConversationId(process.env["PI_SUBAGENT_NAME"])}`;
    return createRealHeadlessClientToolHost(title);
  }

  throw new Error(
    `--${TOOL_HOST_FLAG} must be one of none, mock, or real-headless; received ${mode}`,
  );
};

// Pi loads an extension through its default export.
export default async function brunchPersonaTestingExtension(
  pi: BrunchPersonaExtensionApi,
): Promise<void> {
  registerPersonaAccounting(pi);
  pi.registerFlag(TOOL_HOST_FLAG, {
    type: "string",
    default: "none",
    description: "Client-tool host: none, mock, or real-headless",
  });
  pi.registerFlag(TOOL_MOCKS_FLAG, {
    type: "string",
    description: "Ordered JSON fixture used by the mock client-tool host",
  });
  pi.registerFlag(HEADLESS_TITLE_FLAG, {
    type: "string",
    description: "Document title used by the real-headless Petrinaut host",
  });
  pi.registerFlag(EVIDENCE_DIRECTORY_FLAG, {
    type: "string",
    description:
      "Directory for canonical snapshot, transcript, and trace files",
  });

  pi.registerFlag(BROWSER_SESSION_FLAG, {
    type: "string",
    description:
      "Private operator JSON captured from an initialized Petrinaut browser session",
  });
  let clientToolHost: BrunchClientToolHost | undefined;
  let generation = 0;
  const dispose = async () => {
    generation += 1;
    const previousHost = clientToolHost;
    clientToolHost = undefined;
    await previousHost?.dispose?.();
  };

  pi.on("session_shutdown", dispose);
  pi.on("session_start", async () => {
    // CLI extension flags are applied only after the factory has finished.
    // Invalidate old tool closures before any fallible cleanup or validation:
    // Pi reports lifecycle errors but may continue running the agent.
    await dispose();
    const currentGeneration = generation;
    const browserSessionPath = stringFlag(pi, BROWSER_SESSION_FLAG);
    if (
      pi.getFlag(BROWSER_SESSION_FLAG) !== undefined &&
      browserSessionPath === undefined
    ) {
      throw new Error("--brunch-browser-session requires a non-empty path");
    }
    if (
      browserSessionPath !== undefined &&
      (stringFlag(pi, TOOL_HOST_FLAG) ?? "none") !== "none"
    ) {
      throw new Error(
        "Browser attachment requires --brunch-tool-host=none; browser mutation hosting is not implemented",
      );
    }
    const browserOptions =
      browserSessionPath === undefined
        ? undefined
        : await readBrowserSessionOptions(browserSessionPath);

    clientToolHost = createConfiguredClientToolHost(pi);

    registerBrunchTurn(
      {
        registerTool: (tool) =>
          pi.registerTool({
            ...tool,
            execute: async (...args) => {
              if (generation !== currentGeneration) {
                throw new Error(
                  "brunch_turn session is not initialized; attachment unavailable",
                );
              }
              return tool.execute(...args);
            },
          }),
      },
      {
        ...browserOptions,
        resolveClientToolHost: () => clientToolHost,
        retainSnapshot: async (snapshot) => {
          const directory = stringFlag(pi, EVIDENCE_DIRECTORY_FLAG);
          if (directory !== undefined) {
            await writeProofArtifacts(directory, snapshot);
          }
        },
      },
    );
  });
}
