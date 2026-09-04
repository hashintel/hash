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

/** The slice of Pi's extension API this entry needs; Pi itself is not a workspace dependency. */
interface BrunchPersonaExtensionApi extends BrunchTurnExtensionApi {
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
    handler: () => void | Promise<void>,
  ): void;
}

const TOOL_MOCKS_FLAG = "brunch-tool-mocks";
const HEADLESS_TITLE_FLAG = "brunch-headless-title";
const EVIDENCE_DIRECTORY_FLAG = "brunch-evidence-dir";

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
export default function brunchPersonaTestingExtension(
  pi: BrunchPersonaExtensionApi,
): void {
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

  let clientToolHost: BrunchClientToolHost | undefined;
  pi.on("session_start", async () => {
    await clientToolHost?.dispose?.();
    clientToolHost = createConfiguredClientToolHost(pi);
  });
  pi.on("session_shutdown", async () => {
    await clientToolHost?.dispose?.();
    clientToolHost = undefined;
  });

  registerBrunchTurn(pi, {
    resolveClientToolHost: () => clientToolHost,
    retainSnapshot: async (snapshot) => {
      const directory = stringFlag(pi, EVIDENCE_DIRECTORY_FLAG);
      if (directory !== undefined) {
        await writeProofArtifacts(directory, snapshot);
      }
    },
  });
}
