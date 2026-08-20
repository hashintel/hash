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

export const gherkin = definePlugin({
  name: 'plugin-gherkin',
  targetDomain: 'gherkin',
});
