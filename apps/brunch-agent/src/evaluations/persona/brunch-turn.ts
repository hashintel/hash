/** Pi's only persona tool submits utterances through the launcher's real browser. */
import {
  type Component,
  Markdown,
  type MarkdownTheme,
} from "@earendil-works/pi-tui";
import { Type } from "typebox";

import type { PersonaBrowserReply } from "./browser-bridge.ts";

interface BrunchTurnResult {
  readonly content: readonly { readonly type: "text"; readonly text: string }[];
  readonly details: {
    readonly conversationId: string;
    readonly submissionId: string;
    readonly submissionIds: readonly string[];
    readonly status: "elicitor-replied";
    readonly elicitorText: string;
  };
}

interface RenderTheme {
  bold(text: string): string;
  italic(text: string): string;
  strikethrough(text: string): string;
  underline(text: string): string;
  fg(color: string, text: string): string;
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
  ): Promise<BrunchTurnResult>;
  renderCall(
    parameters: { readonly message: string },
    theme: RenderTheme,
  ): Component;
  renderResult(
    result: BrunchTurnResult,
    options: { readonly isPartial: boolean },
    theme: RenderTheme,
    context: { readonly isError: boolean },
  ): Component;
}

/** Pi itself is not a workspace dependency. */
export interface BrunchTurnExtensionApi {
  registerTool(tool: BrunchTurnTool): void;
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

export const createBrunchTurnTool = (
  browserTurn: (
    message: string,
    signal?: AbortSignal,
  ) => Promise<PersonaBrowserReply>,
): BrunchTurnTool => {
  let active = false;
  let failed = false;
  return {
    name: "brunch_turn",
    label: "Brunch turn",
    description:
      "Send exactly one user utterance through the visible Brunch panel and wait for its reply, including browser-tool continuations.",
    parameters: Type.Object(
      {
        message: Type.String({
          description: "The next utterance addressed to Brunch",
        }),
      },
      { additionalProperties: false },
    ),
    executionMode: "sequential",
    async execute(_toolCallId, { message }, signal) {
      if (!message.trim())
        throw new Error("brunch_turn message must not be empty");
      if (active)
        throw new Error("brunch_turn already has an active submission");
      if (failed)
        throw new Error(
          "brunch_turn cannot send again after a failed or indeterminate browser turn; inspect canonical Flue history",
        );
      signal?.throwIfAborted();
      active = true;
      try {
        const reply = await browserTurn(message, signal);
        const submissionId = reply.submissionIds.at(-1);
        if (!submissionId) throw new Error("Browser reply has no submission");
        return {
          content: [{ type: "text", text: reply.text }],
          details: {
            conversationId: reply.conversationId,
            submissionId,
            submissionIds: reply.submissionIds,
            status: "elicitor-replied",
            elicitorText: reply.text,
          },
        };
      } catch (error) {
        // A disconnected request may already have reached the composer. Never replay it.
        failed = true;
        throw error;
      } finally {
        active = false;
      }
    },
    renderCall(parameters, theme) {
      return markdownComponent("User", parameters.message, theme);
    },
    renderResult(result, _options, theme, context) {
      const text = result.content.map((content) => content.text).join("\n");
      return markdownComponent(
        "Brunch",
        context.isError ? `Turn failed\n\n${text}` : text,
        theme,
      );
    },
  };
};
