import * as v from "valibot";

import { brunchSignals } from "../constants";

import type { DeliveredMessage } from "@flue/sdk";

const vLedgerComment = v.strictObject({
  id: v.pipe(
    v.string(),
    v.regex(/^n(?:0|[1-9]\d*)$/),
    v.description("The comment's ID, such as n3."),
  ),
  records: v.pipe(
    v.array(v.pipe(v.string(), v.minLength(1))),
    v.minLength(1),
    v.description("Addresses of the Ledger records the comment is on."),
  ),
  quote: v.optional(
    v.pipe(
      v.string(),
      v.description("The text the user selected, for display only."),
    ),
  ),
  text: v.pipe(v.string(), v.minLength(1)),
});

export type LedgerComment = v.InferOutput<typeof vLedgerComment>;

const vLedgerCommentsBody = v.strictObject({
  comments: v.pipe(v.array(vLedgerComment), v.minLength(1)),
});

/** Comments the user sends on Ledger records, delivered as one turn of their own. */
export const ledgerCommentsMessage = (
  comments: readonly LedgerComment[],
): Extract<DeliveredMessage, { kind: "signal" }> => ({
  kind: "signal",
  type: brunchSignals.ledgerComments,
  tagName: brunchSignals.ledgerComments,
  body: JSON.stringify({ comments }),
});

/** The comments a comment signal's body carries; absent when it is malformed. */
export const parseLedgerComments = (
  body: string,
): readonly LedgerComment[] | undefined => {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return undefined;
  }
  const parsed = v.safeParse(vLedgerCommentsBody, json);
  return parsed.success ? parsed.output.comments : undefined;
};
