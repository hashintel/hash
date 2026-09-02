import {
  type Component,
  Markdown,
  type MarkdownTheme,
} from "@earendil-works/pi-tui";
import { createFlueClient, type FlueClient } from "@flue/sdk";
import { Type } from "typebox";

import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../../../../../apps/brunch-agent/src/conversation/identity.ts";
import { LOCAL_UI_PRINCIPAL } from "../../../../../apps/brunch-agent/src/conversation/payload.ts";
import { defaultChatOrigin } from "../../../../../apps/brunch-agent/src/http/local-origins.ts";
import { CHAT_AGENT_ROUTE } from "../../../../../apps/brunch-agent/src/http/routes.ts";

type BrunchFlueClient = Pick<FlueClient, "read" | "send">;

interface TextContent {
  readonly type: "text";
  readonly text: string;
}

export interface BrunchTurnDetails {
  readonly conversationId: string;
  readonly submissionId: string;
  readonly status: "elicitor-replied";
  readonly elicitorText: string;
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

interface RegisterBrunchTurnOptions {
  readonly conversationId?: string;
  readonly client?: BrunchFlueClient;
}

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

export const createBrunchTurnTool = ({
  conversationId: suppliedConversationId,
  client: suppliedClient,
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
        const admission = await client.send({
          message: { kind: "user", body: parameters.message },
          uid: incarnationUid ?? null,
          signal,
        });
        admitted = true;
        incarnationUid = admission.uid;

        await onUpdate?.({
          content: [
            {
              type: "text",
              text: `Waiting for elicitor submission ${admission.submissionId}`,
            },
          ],
          details: {
            conversationId,
            submissionId: admission.submissionId,
            status: "waiting-for-elicitor",
          },
        });

        const reply = await client.read(admission, { signal });
        if (reply.text.trim().length === 0) {
          throw new Error(
            `Brunch elicitor completed submission ${admission.submissionId} without assistant text`,
          );
        }

        return {
          content: [{ type: "text", text: reply.text }],
          details: {
            conversationId,
            submissionId: admission.submissionId,
            status: "elicitor-replied",
            elicitorText: reply.text,
          },
        };
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

      return markdownComponent("Brunch", result.details.elicitorText, theme);
    },
  };
};

export const registerBrunchTurn = (
  pi: BrunchTurnExtensionApi,
  options?: RegisterBrunchTurnOptions,
): void => {
  pi.registerTool(createBrunchTurnTool(options));
};

export default function brunchTurnExtension(pi: BrunchTurnExtensionApi): void {
  registerBrunchTurn(pi);
}
