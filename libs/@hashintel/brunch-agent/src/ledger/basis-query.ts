/**
 * The basis query, as every agent that mounts it gives it to its model: its
 * input, its description, and the reason its result gives for each
 * disposition. An agent may mount it under a name of its own.
 */

import * as v from "valibot";

import { arcDirections } from "../petrinaut/net-element-ids";
import { netElementKinds } from "../petrinaut/petrinaut-tool-effects";

/** The basis query's input: one net element, by its selector. */
export const vBasisQueryInput = v.object({
  selector: v.pipe(
    v.object({
      kind: v.picklist(netElementKinds),
      name: v.optional(
        v.pipe(
          v.string(),
          v.description("The element's recorded name, unique within its kind."),
        ),
      ),
      id: v.optional(v.pipe(v.string(), v.description("The element's ID."))),
      transitionId: v.optional(
        v.pipe(v.string(), v.description("For an arc: its transition's ID.")),
      ),
      arcDirection: v.optional(
        v.pipe(
          v.picklist(arcDirections),
          v.description(
            "For an arc: its direction relative to the transition.",
          ),
        ),
      ),
      placeId: v.optional(
        v.pipe(v.string(), v.description("For an arc: its place's ID.")),
      ),
    }),
    v.description(
      "One element by kind and its name or ID; an arc by transitionId, arcDirection and placeId.",
    ),
  ),
});
/** How the basis query names the element it asks about. */
export type BasisQuerySelector = v.InferOutput<
  typeof vBasisQueryInput
>["selector"];

/** The basis query's description. */
export const queryBasisToolDescription =
  "Use when the USER asks why a visible net element exists or is modelled as it is, instead of answering from memory. Finds the element in the latest net read, or in the net read back after a later change, and returns its recorded basis: the reflections that name the element and, behind them, the claims, entities and discharged obligations they rest on, each with its ID, and the conversation turns those records came from, each with its ID and the opening of the USER's words. Answer from that basis and cite its record IDs. Cite every returned turn too, by quoting the opening of the USER's words, never by its ID, so the USER can see what they said that the answer rests on. A claim under `superseded` was later replaced: say so, and give its replacement. It also lists the canonical calls that changed the element, with their document and Ledger revisions. A basis-absent disposition means no reflection names the element: say plainly that its basis was not recorded rather than reconstructing one. You may point to related records, but do not offer a rationale of your own for it. A stale-read disposition means the net changed after the latest net view, a read or a change's read-back, without a later read-back: read it again, then query.";

/** The reason the basis query's result gives for each disposition. */
export const basisQueryReasons = {
  "stale-read":
    "The net changed after the latest net view without a subsequent read-back; read it again, then query.",
  "not-found":
    "The named element is absent or ambiguous in the latest net view.",
  "basis-declared":
    "Reflections name this element; the basis is what they rest on.",
  "basis-absent":
    "No reflection names this element, so its basis was not recorded.",
} as const;
