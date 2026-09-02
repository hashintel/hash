import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

import {
  type Component,
  Markdown,
  type MarkdownTheme,
} from "@earendil-works/pi-tui";
import {
  createFlueClient,
  type FlueClient,
  type FlueConversationPart,
  type FlueConversationSnapshot,
} from "@flue/sdk";
import { Type } from "typebox";

import { READ_PETRINAUT_DOC_TOOL_NAME } from "@hashintel/brunch-agent-plugin-sdcpn/flue";
import { readPetrinautDocToolInputSchema } from "@hashintel/petrinaut-core";

import {
  CLIENT_TOOL_RESULT_SIGNAL,
  isAwaitingClient,
} from "../../../../../../apps/brunch-agent/src/conversation/client-tools.ts";
import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../../../../../../apps/brunch-agent/src/conversation/identity.ts";
import { LOCAL_UI_PRINCIPAL } from "../../../../../../apps/brunch-agent/src/conversation/payload.ts";
import {
  createHeadlessPetrinautClient,
  isPetrinautConstructionToolName,
} from "../../../../../../apps/brunch-agent/src/evaluations/runbook/headless-petrinaut-client.ts";
import { defaultChatOrigin } from "../../../../../../apps/brunch-agent/src/http/local-origins.ts";
import { CHAT_AGENT_ROUTE } from "../../../../../../apps/brunch-agent/src/http/routes.ts";

type BrunchFlueClient = Pick<FlueClient, "history" | "read" | "send">;
type DynamicToolPart = Extract<FlueConversationPart, { type: "dynamic-tool" }>;

interface TextContent {
  readonly type: "text";
  readonly text: string;
}

export type BrunchToolExecutor = "server" | "mock" | "real-headless";

export interface BrunchToolActivity {
  readonly sequence: number;
  readonly submissionId: string;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly executor: BrunchToolExecutor;
  readonly outcome: "output" | "error";
  readonly input: unknown;
  readonly output?: unknown;
  readonly error?: string;
}

export interface BrunchTurnDetails {
  readonly conversationId: string;
  readonly submissionId: string;
  readonly submissionIds: readonly string[];
  readonly status: "elicitor-replied";
  readonly elicitorText: string;
  readonly toolActivity: readonly BrunchToolActivity[];
}

interface BrunchTurnProgressDetails {
  readonly conversationId: string;
  readonly submissionId: string;
  readonly status: "waiting-for-elicitor";
}

interface BrunchTurnResult<
  Details extends BrunchTurnDetails | BrunchTurnProgressDetails =
    | BrunchTurnDetails
    | BrunchTurnProgressDetails,
> {
  readonly content: readonly TextContent[];
  readonly details: Details;
}

interface RenderTheme {
  bold(text: string): string;
  italic(text: string): string;
  strikethrough(text: string): string;
  underline(text: string): string;
  fg(color: string, text: string): string;
}

interface RenderContext {
  readonly isError: boolean;
}

export interface BrunchTurnTool {
  readonly name: "brunch_turn";
  readonly label: string;
  readonly description: string;
  readonly parameters: ReturnType<typeof Type.Object>;
  readonly executionMode: "sequential";
  execute(
    toolCallId: string,
    parameters: { readonly message: string },
    signal?: AbortSignal,
    onUpdate?: (
      result: BrunchTurnResult<BrunchTurnProgressDetails>,
    ) => void | Promise<void>,
  ): Promise<BrunchTurnResult<BrunchTurnDetails>>;
  renderCall(
    parameters: { readonly message: string },
    theme: RenderTheme,
  ): Component;
  renderResult(
    result: BrunchTurnResult,
    options: { readonly isPartial: boolean },
    theme: RenderTheme,
    context: RenderContext,
  ): Component;
}

export interface BrunchTurnExtensionApi {
  registerTool(tool: BrunchTurnTool): void;
}

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

export interface BrunchClientToolCall {
  readonly submissionId: string;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly input: unknown;
}

export interface BrunchClientToolHost {
  readonly kind: Exclude<BrunchToolExecutor, "server">;
  execute(call: BrunchClientToolCall): Promise<unknown>;
  dispose?(): void | Promise<void>;
}

export interface MockBrunchClientToolCall {
  readonly toolName: string;
  readonly input: unknown;
  readonly output: unknown;
}

interface RegisterBrunchTurnOptions {
  readonly conversationId?: string;
  readonly client?: BrunchFlueClient;
  readonly resolveClientToolHost?: () => BrunchClientToolHost | undefined;
}

const MAX_CLIENT_TOOL_ROUNDS = 20;
const TOOL_HOST_FLAG = "brunch-tool-host";
const TOOL_MOCKS_FLAG = "brunch-tool-mocks";
const HEADLESS_TITLE_FLAG = "brunch-headless-title";

const markdownTheme = (theme: RenderTheme): MarkdownTheme => ({
  heading: (text) => theme.fg("mdHeading", text),
  link: (text) => theme.fg("mdLink", text),
  linkUrl: (text) => theme.fg("mdLinkUrl", text),
  code: (text) => theme.fg("mdCode", text),
  codeBlock: (text) => theme.fg("mdCodeBlock", text),
  codeBlockBorder: (text) => theme.fg("mdCodeBlockBorder", text),
  quote: (text) => theme.fg("mdQuote", text),
  quoteBorder: (text) => theme.fg("mdQuoteBorder", text),
  hr: (text) => theme.fg("mdHr", text),
  listBullet: (text) => theme.fg("mdListBullet", text),
  bold: (text) => theme.bold(text),
  italic: (text) => theme.italic(text),
  strikethrough: (text) => theme.strikethrough(text),
  underline: (text) => theme.underline(text),
});

const markdownComponent = (
  heading: "User" | "Brunch",
  content: string,
  theme: RenderTheme,
): Component =>
  new Markdown(`## ${heading}\n\n${content}`, 0, 0, markdownTheme(theme), {
    color: (text) => theme.fg("toolOutput", text),
  });

const resultText = (result: BrunchTurnResult): string =>
  result.content
    .filter((content): content is TextContent => content.type === "text")
    .map((content) => content.text)
    .join("\n");

const errorMessageFrom = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const requireConversationId = (value: string | undefined): string => {
  const conversationId = value?.trim();
  if (!conversationId) {
    throw new Error(
      "brunch_turn requires a non-empty PI_SUBAGENT_NAME; no conversation was created",
    );
  }
  return conversationId;
};

const createClient = (conversationId: string): BrunchFlueClient => {
  const identity = {
    principalKey: LOCAL_UI_PRINCIPAL,
    conversationId,
  };

  return createFlueClient({
    url: `${defaultChatOrigin}/agents/${CHAT_AGENT_ROUTE}/${flueConversationIdFrom(identity)}`,
    headers: agentOwnershipHeaders(identity),
  });
};

const submissionToolParts = (
  snapshot: FlueConversationSnapshot,
  submissionId: string,
): readonly {
  readonly submissionId: string;
  readonly part: DynamicToolPart;
}[] => {
  const answeredBySubmissionId = snapshot.settlements.find(
    (settlement) => settlement.submissionId === submissionId,
  )?.answeredBySubmissionId;
  const responseSubmissionId = answeredBySubmissionId ?? submissionId;

  return snapshot.messages.flatMap((message) => {
    if (
      message.purpose !== "assistant" ||
      message.submissionId !== responseSubmissionId
    ) {
      return [];
    }

    return message.parts.flatMap((part) =>
      part.type === "dynamic-tool"
        ? [{ submissionId: responseSubmissionId, part }]
        : [],
    );
  });
};

const toolActivityMarkdown = (
  activity: readonly BrunchToolActivity[],
): string => {
  if (activity.length === 0) return "";

  return [
    "",
    "### Tool activity",
    "",
    ...activity.map(
      (entry) =>
        `- \`${entry.toolName}\` (\`${entry.toolCallId}\`) — ${entry.executor}; ${entry.outcome}`,
    ),
  ].join("\n");
};

export const createMockClientToolHost = (
  calls: readonly MockBrunchClientToolCall[],
): BrunchClientToolHost => {
  let nextCallIndex = 0;

  return {
    kind: "mock",
    async execute(call) {
      const expected = calls[nextCallIndex];
      if (expected === undefined) {
        throw new Error(
          `Mock client-tool fixture has no call ${nextCallIndex + 1}; received ${call.toolName}`,
        );
      }
      if (
        expected.toolName !== call.toolName ||
        !isDeepStrictEqual(expected.input, call.input)
      ) {
        throw new Error(
          `Mock client-tool call ${nextCallIndex + 1} mismatch: expected ${expected.toolName} ${JSON.stringify(expected.input)}, received ${call.toolName} ${JSON.stringify(call.input)}`,
        );
      }

      nextCallIndex += 1;
      return expected.output;
    },
  };
};

const stripImages = (markdown: string): string =>
  markdown
    .replace(/<img\b[^>]*\/?>(?:\s*<\/img>)?/giu, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, "")
    .replace(/\n{3,}/gu, "\n\n");

export const createRealHeadlessClientToolHost = (
  title: string,
): BrunchClientToolHost => {
  const petrinautClient = createHeadlessPetrinautClient(title);

  return {
    kind: "real-headless",
    async execute(call) {
      if (call.toolName === READ_PETRINAUT_DOC_TOOL_NAME) {
        const { doc } = readPetrinautDocToolInputSchema.parse(call.input);
        const markdown = await readFile(
          new URL(`../../../../petrinaut/docs/${doc}.md`, import.meta.url),
          "utf8",
        );
        return stripImages(markdown);
      }

      if (isPetrinautConstructionToolName(call.toolName)) {
        const result = await petrinautClient.execute(call);
        return result.output;
      }

      throw new Error(
        `Real headless client-tool host does not support ${call.toolName}`,
      );
    },
    dispose: petrinautClient.dispose,
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const readMockCalls = (path: string): readonly MockBrunchClientToolCall[] => {
  const absolutePath = resolve(process.cwd(), path);
  const value: unknown = JSON.parse(readFileSync(absolutePath, "utf8"));
  if (!isRecord(value) || !Array.isArray(value["calls"])) {
    throw new Error(
      `Mock client-tool fixture ${absolutePath} must contain a calls array`,
    );
  }

  return value["calls"].map((call, index) => {
    if (
      !isRecord(call) ||
      typeof call["toolName"] !== "string" ||
      !Object.hasOwn(call, "input") ||
      !Object.hasOwn(call, "output")
    ) {
      throw new Error(
        `Mock client-tool fixture ${absolutePath} call ${index + 1} must contain toolName, input, and output`,
      );
    }
    return {
      toolName: call["toolName"],
      input: call["input"],
      output: call["output"],
    };
  });
};

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

export const createBrunchTurnTool = ({
  conversationId: suppliedConversationId,
  client: suppliedClient,
  resolveClientToolHost = () => undefined,
}: RegisterBrunchTurnOptions = {}): BrunchTurnTool => {
  const conversationId = requireConversationId(
    suppliedConversationId ?? process.env["PI_SUBAGENT_NAME"],
  );
  const client = suppliedClient ?? createClient(conversationId);
  let active = false;
  let incarnationUid: string | undefined;
  let unsafeAfterAdmission = false;

  return {
    name: "brunch_turn",
    label: "Brunch turn",
    description:
      "Send exactly one user utterance to the production Brunch elicitor and wait for that submission's exact reply.",
    parameters: Type.Object(
      {
        message: Type.String({
          description: "The next utterance addressed to the Brunch elicitor",
        }),
      },
      { additionalProperties: false },
    ),
    executionMode: "sequential",

    async execute(_toolCallId, parameters, signal, onUpdate) {
      if (parameters.message.trim().length === 0) {
        throw new Error("brunch_turn message must not be empty");
      }
      if (active) {
        throw new Error("brunch_turn already has an active submission");
      }
      if (unsafeAfterAdmission) {
        throw new Error(
          "brunch_turn cannot send again after an unsettled or failed admitted submission; inspect canonical Flue history",
        );
      }

      active = true;
      let admitted = false;
      try {
        let currentAdmission = await client.send({
          message: { kind: "user", body: parameters.message },
          uid: incarnationUid ?? null,
          signal,
        });
        admitted = true;
        incarnationUid = currentAdmission.uid;

        const completedClientCallIds = new Set<string>();
        const submissionIds: string[] = [];
        const toolActivity: BrunchToolActivity[] = [];
        let clientToolRounds = 0;

        while (true) {
          submissionIds.push(currentAdmission.submissionId);
          await onUpdate?.({
            content: [
              {
                type: "text",
                text: `Waiting for elicitor submission ${currentAdmission.submissionId}`,
              },
            ],
            details: {
              conversationId,
              submissionId: currentAdmission.submissionId,
              status: "waiting-for-elicitor",
            },
          });

          const reply = await client.read(currentAdmission, { signal });
          const snapshot = await client.history({ signal });
          const pendingClientCalls: BrunchClientToolCall[] = [];

          for (const observed of submissionToolParts(
            snapshot,
            currentAdmission.submissionId,
          )) {
            const { part } = observed;
            if (part.state === "input-available") {
              throw new Error(
                `Brunch submission ${observed.submissionId} settled with incomplete tool call ${part.toolName} (${part.toolCallId})`,
              );
            }
            if (
              part.state === "output-available" &&
              isAwaitingClient(part.output)
            ) {
              if (!completedClientCallIds.has(part.toolCallId)) {
                pendingClientCalls.push({
                  submissionId: observed.submissionId,
                  toolCallId: part.toolCallId,
                  toolName: part.toolName,
                  input: part.input,
                });
              }
              continue;
            }

            toolActivity.push({
              sequence: toolActivity.length + 1,
              submissionId: observed.submissionId,
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              executor: "server",
              outcome: part.state === "output-available" ? "output" : "error",
              input: part.input,
              ...(part.state === "output-available"
                ? { output: part.output }
                : { error: part.errorText }),
            });
          }

          if (pendingClientCalls.length === 0) {
            if (reply.text.trim().length === 0) {
              throw new Error(
                `Brunch elicitor completed submission ${currentAdmission.submissionId} without assistant text`,
              );
            }

            return {
              content: [{ type: "text", text: reply.text }],
              details: {
                conversationId,
                submissionId: currentAdmission.submissionId,
                submissionIds,
                status: "elicitor-replied",
                elicitorText: reply.text,
                toolActivity,
              },
            };
          }

          if (clientToolRounds >= MAX_CLIENT_TOOL_ROUNDS) {
            throw new Error(
              `brunch_turn reached the ${MAX_CLIENT_TOOL_ROUNDS}-round client-tool limit`,
            );
          }
          clientToolRounds += 1;

          const host = resolveClientToolHost();
          if (host === undefined) {
            throw new Error(
              `Brunch requested client tool ${pendingClientCalls[0]?.toolName}; select --${TOOL_HOST_FLAG}=mock or --${TOOL_HOST_FLAG}=real-headless`,
            );
          }

          const results: {
            readonly toolCallId: string;
            readonly toolName: string;
            readonly output: unknown;
          }[] = [];

          for (const call of pendingClientCalls) {
            try {
              // Tool calls within one suspension are serviced in canonical order.
              const output = await host.execute(call);
              completedClientCallIds.add(call.toolCallId);
              results.push({
                toolCallId: call.toolCallId,
                toolName: call.toolName,
                output,
              });
              toolActivity.push({
                sequence: toolActivity.length + 1,
                submissionId: call.submissionId,
                toolCallId: call.toolCallId,
                toolName: call.toolName,
                executor: host.kind,
                outcome: "output",
                input: call.input,
                output,
              });
            } catch (error) {
              const message = errorMessageFrom(error);
              toolActivity.push({
                sequence: toolActivity.length + 1,
                submissionId: call.submissionId,
                toolCallId: call.toolCallId,
                toolName: call.toolName,
                executor: host.kind,
                outcome: "error",
                input: call.input,
                error: message,
              });
              throw new Error(
                `${host.kind} client-tool host failed ${call.toolName} (${call.toolCallId}): ${message}`,
                { cause: error },
              );
            }
          }

          currentAdmission = await client.send({
            message: {
              kind: "signal",
              type: CLIENT_TOOL_RESULT_SIGNAL,
              tagName: CLIENT_TOOL_RESULT_SIGNAL,
              body: JSON.stringify(results),
              attributes: {
                toolCallIds: results
                  .map((result) => result.toolCallId)
                  .join(","),
              },
            },
            uid: incarnationUid,
            signal,
          });
          incarnationUid = currentAdmission.uid;
        }
      } catch (error) {
        if (admitted) {
          unsafeAfterAdmission = true;
        }
        throw error;
      } finally {
        active = false;
      }
    },

    renderCall(parameters, theme) {
      return markdownComponent("User", parameters.message, theme);
    },

    renderResult(result, { isPartial }, theme, context) {
      if (context.isError) {
        return markdownComponent(
          "Brunch",
          `Turn failed\n\n${resultText(result)}`,
          theme,
        );
      }

      if (isPartial || result.details.status === "waiting-for-elicitor") {
        return markdownComponent("Brunch", resultText(result), theme);
      }

      return markdownComponent(
        "Brunch",
        `${result.details.elicitorText}${toolActivityMarkdown(result.details.toolActivity)}`,
        theme,
      );
    },
  };
};

export const registerBrunchTurn = (
  pi: BrunchTurnExtensionApi,
  options?: RegisterBrunchTurnOptions,
): void => {
  pi.registerTool(createBrunchTurnTool(options));
};

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
  });
}
