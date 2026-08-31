/**
 * `@hashintel/brunch-agent-plugin-gherkin` — the gherkin target formalism (spec §13.1).
 *
 * The tracer target: cheap enough to wire end-to-end first, and deliberately
 * different in shape from the process-model plugin, so that the plugin
 * contract is co-authored against two formalisms and freezes toward neither
 * (spec §13's two-targets-on-each-axis rule; ADR-0007 decision 9). Its
 * definition is `plugin.yaml` — a feature-anchored tree of rules, examples,
 * and steps under the same harness-owned keys as every plugin. Its proposal
 * stays at the verbatim floor in this cycle; `project` and `validate` land
 * with their own slice.
 *
 * **This package resolves `@hashintel/brunch-agent` and nothing else** — never the binding,
 * never Flue. Target policy has no business knowing which substrate it is
 * running on, and it is storage-blind besides (spec §9.6).
 */

import * as v from "valibot";

import { definePlugin, readPluginDefinition } from "@hashintel/brunch-agent";

import pluginYaml from "../plugin.yaml?raw";

const nonEmptyString = v.pipe(v.string(), v.nonEmpty());
const evidenceQuote = v.strictObject({ excerpt: nonEmptyString });

export const StatementNotedProposal = v.pipe(
  v.strictObject({
    evidence: v.pipe(v.array(evidenceQuote), v.minLength(1)),
    epistemicStatus: v.literal("explicit"),
    confidence: v.picklist(["firm", "hedged", "speculative"]),
    content: v.strictObject({
      value: v.strictObject({
        type: v.literal("statement-noted"),
        interior: v.strictObject({ verbatim: nonEmptyString }),
      }),
    }),
  }),
  v.check(
    (proposal) =>
      proposal.evidence.some(
        (evidence) =>
          evidence.excerpt === proposal.content.value.interior.verbatim,
      ),
    "The verbatim interior must equal one cited user quote.",
  ),
);

export type StatementNotedProposalInput = v.InferInput<
  typeof StatementNotedProposal
>;

/** The plugin definition; reading fails loudly at module load if the contract is broken. */
export const gherkinDefinition = readPluginDefinition(pluginYaml);

export const gherkin = definePlugin({
  name: "plugin-gherkin",
  targetFormalism: "gherkin",
  definition: gherkinDefinition,
  proposalCatalog: [
    {
      name: "statement-noted",
      description:
        "Record one condition-shaped statement at the verbatim grade floor, with no parsed structure.",
      schema: StatementNotedProposal,
    },
  ],
});
