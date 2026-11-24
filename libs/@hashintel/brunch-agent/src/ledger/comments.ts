import * as v from "valibot";

import { brunchSignals } from "../constants";
import {
  parseVersionLoad,
  type VersionLoad,
} from "../petrinaut/submission-context";
import { commentIdGrammar } from "./shared/references";

import type { DeliveredMessage } from "@flue/sdk";

const ledgerCommentSchema = v.strictObject({
  id: v.pipe(
    v.string(),
    v.regex(new RegExp(`^${commentIdGrammar}$`)),
    v.description("The comment's opaque ID, issued by the browser."),
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

export type LedgerComment = v.InferOutput<typeof ledgerCommentSchema>;

const ledgerCommentsBodySchema = v.strictObject({
  comments: v.pipe(v.array(ledgerCommentSchema), v.minLength(1)),
});

/**
 * The host's version load rides in the signal's attributes, not its body, so
 * an agent that does not read them still accepts the comments.
 */
const versionLoadAttributes = {
  id: "version-load-id",
  decisionTime: "version-load-decision-time",
} as const;

/** Comments the user sends on Ledger records, delivered as one turn of their own. */
export const ledgerCommentsMessage = (
  comments: readonly LedgerComment[],
  { versionLoad }: { readonly versionLoad?: VersionLoad } = {},
): Extract<DeliveredMessage, { kind: "signal" }> => ({
  kind: "signal",
  type: brunchSignals.ledgerComments,
  tagName: brunchSignals.ledgerComments,
  body: JSON.stringify({ comments }),
  ...(versionLoad === undefined
    ? {}
    : {
        attributes: {
          [versionLoadAttributes.id]: versionLoad.id,
          [versionLoadAttributes.decisionTime]: versionLoad.decisionTime,
        },
      }),
});

/** The version load a comment signal's attributes carry; absent when missing or invalid. */
export const ledgerCommentsVersionLoad = (
  attributes: Readonly<Record<string, string>> | undefined,
): VersionLoad | undefined =>
  parseVersionLoad({
    id: attributes?.[versionLoadAttributes.id],
    decisionTime: attributes?.[versionLoadAttributes.decisionTime],
  });

/** The attributes left once a comment signal's version load is removed. */
export const withoutLedgerCommentsVersionLoad = (
  attributes: Readonly<Record<string, string>> | undefined,
): Readonly<Record<string, string>> | undefined => {
  if (attributes === undefined) return undefined;
  const {
    [versionLoadAttributes.id]: _id,
    [versionLoadAttributes.decisionTime]: _decisionTime,
    ...rest
  } = attributes;
  return Object.keys(rest).length === 0 ? undefined : rest;
};

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
  const parsed = v.safeParse(ledgerCommentsBodySchema, json);
  return parsed.success ? parsed.output.comments : undefined;
};
