/**
 * The user's message as `POST /chat` admits it: an input entry whose content
 * is what the model reads, and whose data keeps what the panel sent with it.
 *
 * - A body of Ledger comments, as the panel's comment bar sends it, is a
 *   `brunch.ledger-comments` entry that the model reads as Brunch on Flue's
 *   comment signal, byte for byte.
 * - Anything else is a `brunch.user` entry. Its body is parsed by Brunch's
 *   own parser, so a malformed envelope is admitted as it was sent, never
 *   refused. The content is the body without its submission context: the
 *   user's text, or the diagnostics envelope when the panel sent diagnostics.
 *   Submission context is host data the agent reads from the entry, not the
 *   model's.
 */
import {
  brunchSignals,
  type LedgerComment,
  ledgerCommentsMessage,
  parseLedgerComments,
  parsePetrinautUserMessageBody,
  petrinautContextualUserMessageBody,
  readPetrinautSubmissionContext,
  type VersionLoad,
} from "@hashintel/brunch-agent";

import type { JsonObject } from "@earendil-works/pi-durable";

/** The entry kind a user's chat message is placed as. */
export const brunchUserKind = "brunch.user";

/** The entry kind a user's Ledger comments are placed as. */
export const ledgerCommentsKind = brunchSignals.ledgerComments;

/** What a `brunch.user` entry keeps of the panel's body, by how it parsed. */
export type BrunchUserData =
  | { readonly body: "ordinary"; readonly userText: string }
  | {
      readonly body: "contextual";
      readonly userText: string;
      /** Present when the panel sent diagnostics. */
      readonly diagnosticsContext?: string;
      /** Present for a v2 envelope; a v1 envelope carries diagnostics only. */
      readonly submissionContext?: JsonObject;
    }
  | { readonly body: "invalid-contextual" };

/** What a `brunch.ledger-comments` entry keeps: the comments as parsed. */
export type LedgerCommentsData = {
  // Mutable, as Pi's entry data is.
  readonly comments: LedgerComment[];
};

/** An input `POST /chat` admits, before the version-load note. */
export type ChatInput = {
  readonly content: string;
  readonly entry:
    | { readonly kind: typeof brunchUserKind; readonly data: BrunchUserData }
    | {
        readonly kind: typeof ledgerCommentsKind;
        readonly data: LedgerCommentsData;
      };
  /** The saved version the panel says the user has loaded, from a v2 envelope. */
  readonly versionLoad?: VersionLoad;
};

const escapeXmlText = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const escapeXmlAttribute = (value: string) =>
  escapeXmlText(value).replaceAll('"', "&quot;");

/**
 * What Flue's model reads for the comment signal: `renderSignalMessage` of
 * `@flue/runtime`, for a signal without attributes.
 */
const renderedComments = (comments: readonly LedgerComment[]) => {
  const signal = ledgerCommentsMessage(comments);
  const tagName = signal.tagName ?? "signal";
  return `<${tagName} type="${escapeXmlAttribute(signal.type)}">\n${escapeXmlText(signal.body)}\n</${tagName}>`;
};

const userInput = (text: string): ChatInput => {
  const parsed = parsePetrinautUserMessageBody(text);
  if (parsed.kind === "ordinary")
    return {
      content: text,
      entry: {
        kind: brunchUserKind,
        data: { body: "ordinary", userText: text },
      },
    };
  if (parsed.kind === "invalid-contextual")
    return {
      content: text,
      entry: { kind: brunchUserKind, data: { body: "invalid-contextual" } },
    };
  const { userText, diagnosticsContext, submissionContext } = parsed;
  const diagnostics = diagnosticsContext === "" ? {} : { diagnosticsContext };
  // A v1 envelope carries diagnostics only: the model reads it as sent.
  if (submissionContext === undefined)
    return {
      content: text,
      entry: {
        kind: brunchUserKind,
        data: { body: "contextual", userText, ...diagnostics },
      },
    };
  const { versionLoad } = readPetrinautSubmissionContext(parsed);
  return {
    content:
      diagnosticsContext === ""
        ? userText
        : petrinautContextualUserMessageBody({ userText, diagnosticsContext }),
    entry: {
      kind: brunchUserKind,
      data: {
        body: "contextual",
        userText,
        ...diagnostics,
        // Parsed from JSON, so JSON.
        submissionContext: submissionContext as JsonObject,
      },
    },
    ...(versionLoad === undefined ? {} : { versionLoad }),
  };
};

/** The input content and entry for the panel's message body `text`. */
export const brunchUserInput = (text: string): ChatInput => {
  const comments = parseLedgerComments(text);
  if (comments === undefined) return userInput(text);
  return {
    content: renderedComments(comments),
    entry: { kind: ledgerCommentsKind, data: { comments: [...comments] } },
  };
};
