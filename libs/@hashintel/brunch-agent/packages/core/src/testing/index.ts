/**
 * `@hashintel/brunch-agent/testing` — fixtures, arbitraries, and the replay driver.
 *
 * A subpath rather than a package so production bundles stay clean (spec
 * §12.2): nothing on a deploy path may import it. That, too, is checked
 * mechanically rather than merely documented.
 *
 * The generation-first corpus and the deterministic replay driver (spec §14.4)
 * land with their own slices; this module holds the seed fixtures they grow
 * from.
 */

import * as v from "valibot";

import { definePlugin, type Plugin } from "../plugin";

const fixtureProposalSchema = v.strictObject({
  evidence: v.pipe(
    v.array(v.strictObject({ excerpt: v.pipe(v.string(), v.nonEmpty()) })),
    v.minLength(1),
  ),
  epistemicStatus: v.literal("explicit"),
  confidence: v.pipe(v.string(), v.nonEmpty()),
  content: v.strictObject({ value: v.literal("fixture") }),
});

/**
 * The smallest honest plugin (spec §11.3), as a fixture: a flat record list and
 * one validator must suffice, and every harness-contract addition is checked
 * against the bar it raises. Tests that need *a* plugin without caring which
 * one take this.
 */
export function pluginFixture(overrides: Partial<Plugin> = {}): Plugin {
  return definePlugin({
    name: "plugin-fixture",
    targetDomain: "fixture",
    proposalCatalog: [
      {
        name: "fixture-proposal",
        description: "A fixture-only capture proposal.",
        schema: fixtureProposalSchema,
      },
    ],
    ...overrides,
  });
}
