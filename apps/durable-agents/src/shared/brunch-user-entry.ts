/**
 * The durable entry a user's chat message is placed as: its kind, what its
 * data keeps, and how a reader gets the user's own words back from it.
 * `POST /chat` admission writes it; the Ledger anchors a USER turn on it, and
 * the history route and `query_basis` read its words. Each reader decides for
 * itself what an entry without words stands for.
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
 * The user's own words a `brunch.user` entry keeps, without the context the
 * panel sent with them: its `data.userText`. Any other entry, and one whose
 * envelope did not parse, keeps none.
 */
export const brunchUserWords = (
  entry: Pick<EntryRecord, "kind" | "data"> | undefined,
): string | undefined => {
  if (entry?.kind !== brunchUserKind) return undefined;
  const { data } = entry;
  return typeof data === "object" &&
    data !== null &&
    !Array.isArray(data) &&
    typeof data.userText === "string"
    ? data.userText
    : undefined;
};
