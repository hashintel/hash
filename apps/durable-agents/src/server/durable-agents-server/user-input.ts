/**
 * The user's message as `POST /chat` admits it: a `brunch.user` input entry
 * whose content is what the model reads, and whose data keeps what the panel
 * sent with it. The panel's body is parsed by Brunch's own parser, so a
 * malformed envelope is admitted as it was sent, never refused.
 *
 * The content is the body without its submission context: the user's text,
 * or the diagnostics envelope when the panel sent diagnostics. Submission
 * context is host data the agent reads from the entry, not the model's.
 */
import {
  parsePetrinautUserMessageBody,
  petrinautContextualUserMessageBody,
} from "@hashintel/brunch-agent";

import type { JsonObject } from "@earendil-works/pi-durable";

/** The entry kind a user's chat message is placed as. */
export const brunchUserKind = "brunch.user";

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

const parsedInput = (
  text: string,
): { readonly content: string; readonly data: BrunchUserData } => {
  const parsed = parsePetrinautUserMessageBody(text);
  if (parsed.kind === "ordinary")
    return { content: text, data: { body: "ordinary", userText: text } };
  if (parsed.kind === "invalid-contextual")
    return { content: text, data: { body: "invalid-contextual" } };
  const { userText, diagnosticsContext, submissionContext } = parsed;
  const diagnostics = diagnosticsContext === "" ? {} : { diagnosticsContext };
  // A v1 envelope carries diagnostics only: the model reads it as sent.
  if (submissionContext === undefined)
    return {
      content: text,
      data: { body: "contextual", userText, ...diagnostics },
    };
  return {
    content:
      diagnosticsContext === ""
        ? userText
        : petrinautContextualUserMessageBody({ userText, diagnosticsContext }),
    data: {
      body: "contextual",
      userText,
      ...diagnostics,
      // Parsed from JSON, so JSON.
      submissionContext: submissionContext as JsonObject,
    },
  };
};

/** The input content and entry for the panel's message body `text`. */
export const brunchUserInput = (text: string) => {
  const { content, data } = parsedInput(text);
  return { content, entry: { kind: brunchUserKind, data } } as const;
};
