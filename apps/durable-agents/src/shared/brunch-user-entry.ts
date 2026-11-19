/**
 * The durable entry a user's chat message is placed as: its kind, what its
 * data keeps, and how a reader gets the user's own words back from it.
 * `POST /chat` admission writes it; the Ledger anchors a USER turn on it and
 * keeps its words, and the history route reads them.
 */
import type { EntryRecord, JsonObject } from "@earendil-works/pi-durable";

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

/**
 * The user's own words an input entry keeps. A `brunch.user` entry keeps them
 * without the context the panel sent: its `data.userText`. An older `pi.user`
 * entry, or a `brunch.user` entry whose envelope did not parse, keeps them as
 * the text of its user message. Any other entry keeps none.
 */
export const userWords = (
  entry: Pick<EntryRecord, "kind" | "data" | "model"> | undefined,
): string => {
  const data = entry?.kind === brunchUserKind ? entry.data : undefined;
  if (
    typeof data === "object" &&
    data !== null &&
    !Array.isArray(data) &&
    typeof data.userText === "string"
  )
    return data.userText;
  const message = entry?.model?.[0];
  if (message?.role !== "user") return "";
  return typeof message.content === "string"
    ? message.content
    : message.content
        .flatMap((part) => (part.type === "text" ? [part.text] : []))
        .join(" ");
};
