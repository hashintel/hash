/**
 * `@hashintel/brunch-agent-plugin-sdcpn` — the SDCPN target formalism (ADR-0006).
 *
 * The plugin is `plugin.md`: one sectioned Markdown file whose three tables the
 * harness parses into the model vocabulary, the demand list, and the pattern
 * index, and whose prose becomes the interviewer's instructions. This module
 * loads that file and declares the one proposal type a kind-and-slot plugin
 * needs: a slot assertion addressed to a kind, node, and slot the file names.
 * The file names no domain, and neither does this code.
 *
 * **This package resolves `@hashintel/brunch-agent` and nothing else** — never the
 * binding, never Flue, and it is storage-blind (spec §9.6). `project` and
 * `validate` (ADR-0005) land with the realization slice.
 */

import * as v from "valibot";

import {
  createSlotAssertionSchema,
  definePlugin,
  parsePluginFile,
} from "@hashintel/brunch-agent";

import pluginMarkdown from "../plugin.md?raw";

const nonEmptyString = v.pipe(v.string(), v.nonEmpty());
const evidenceQuote = v.strictObject({ excerpt: nonEmptyString });

/** The parsed plugin file; parsing fails loudly at module load if the contract is broken. */
export const sdcpnPluginFile = parsePluginFile(pluginMarkdown);

/**
 * One slot assertion, quote-anchored, restricted to the file's kinds and slots.
 * The harness resolves quotes to evidence spans at apply time; the proposal
 * carries excerpts only.
 */
export const SlotAssertedProposal = v.strictObject({
  evidence: v.pipe(v.array(evidenceQuote), v.minLength(1)),
  epistemicStatus: v.picklist(["explicit", "inferred", "tentative"]),
  confidence: v.picklist(["firm", "hedged", "speculative"]),
  content: v.strictObject({
    value: createSlotAssertionSchema(sdcpnPluginFile),
  }),
});

export type SlotAssertedProposalInput = v.InferInput<
  typeof SlotAssertedProposal
>;

export const sdcpn = definePlugin({
  name: "plugin-sdcpn",
  targetFormalism: "sdcpn",
  file: sdcpnPluginFile,
  proposalCatalog: [
    {
      name: "slot-asserted",
      description:
        "Record what the expert said about one slot of one node: its kind, node, slot, the precision the answer reached, and the value or explicit absence, with verbatim quotes.",
      schema: SlotAssertedProposal,
    },
  ],
});
