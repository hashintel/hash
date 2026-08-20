/**
 * `@brunch/plugin-gherkin` — the gherkin target-domain (spec §13.1).
 *
 * The tracer target: cheap enough to wire end-to-end first, and deliberately
 * trivial, so it must not be the plugin that freezes the contract (spec §13's
 * two-targets-on-each-axis rule). Its packs, `project`, and `validate` land
 * with their own slice.
 *
 * **This package resolves `@brunch/core` and nothing else** — never the binding,
 * never Flue. Target policy has no business knowing which substrate it is
 * running on, and it is storage-blind besides (spec §9.6).
 */

import { definePlugin } from '@brunch/core';
import * as v from 'valibot';

const nonEmptyString = v.pipe(v.string(), v.nonEmpty());
const evidenceQuote = v.strictObject({ excerpt: nonEmptyString });

const StatementNotedProposal = v.pipe(
  v.strictObject({
    evidence: v.pipe(v.array(evidenceQuote), v.minLength(1)),
    epistemicStatus: v.literal('explicit'),
    confidence: v.picklist(['firm', 'hedged', 'speculative']),
    content: v.strictObject({
      value: v.strictObject({
        type: v.literal('statement-noted'),
        interior: v.strictObject({ verbatim: nonEmptyString }),
      }),
    }),
  }),
  v.check(
    (proposal) =>
      proposal.evidence.some(
        (evidence) => evidence.excerpt === proposal.content.value.interior.verbatim,
      ),
    'The verbatim interior must equal one cited user quote.',
  ),
);

export const gherkin = definePlugin({
  name: 'plugin-gherkin',
  targetDomain: 'gherkin',
  proposalCatalog: [
    {
      name: 'statement-noted',
      description:
        'Record one condition-shaped statement at the verbatim grade floor, with no parsed structure.',
      schema: StatementNotedProposal,
    },
  ],
});
