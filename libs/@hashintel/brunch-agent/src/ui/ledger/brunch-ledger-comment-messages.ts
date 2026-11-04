import {
  parseLedgerComments,
  type LedgerComment,
} from "@hashintel/brunch-agent";

import type { PetrinautAiMessage } from "../chat/ai-assistant-panel";

const quoteLimit = 120;

/** The passage a comment was made on, shortened to fit beside it. */
export const shortQuote = (quote: string) => {
  const flat = quote.replace(/\s+/g, " ").trim();
  return flat.length > quoteLimit
    ? `${flat.slice(0, quoteLimit).trimEnd()}…`
    : flat;
};

const commentLine = ({ quote, text }: LedgerComment) =>
  quote === undefined || quote.trim() === ""
    ? text
    : `“${shortQuote(quote)}” — ${text}`;

/** Shows a turn of Ledger comments as the comments, not as the JSON Brunch receives. */
export const showLedgerComments = (
  messages: PetrinautAiMessage[],
): PetrinautAiMessage[] =>
  messages.map((message) => {
    if (message.role !== "user") return message;
    const comments = parseLedgerComments(
      message.parts
        .flatMap((part) => (part.type === "text" ? [part.text] : []))
        .join(""),
    );
    if (comments === undefined) return message;
    return {
      ...message,
      parts: [
        {
          type: "text",
          text: ["Comments on the Ledger", ...comments.map(commentLine)].join(
            "\n",
          ),
        },
      ],
    };
  });
