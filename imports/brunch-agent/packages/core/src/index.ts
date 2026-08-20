/**
 * `@brunch/core` — the harness.
 *
 * Mechanism and orchestration: the conversation loop, the ask API, the capture
 * envelope, the issue queue, sweep bookkeeping. Its public export surface *is*
 * the plugin SDK (spec §12.2).
 *
 * **The harness imports no substrate.** A binding imports both this package and
 * its substrate; plugins resolve this package only. That direction is enforced
 * mechanically — see `test/boundaries.test.ts` at the repo root.
 */

export {
  AskInput,
  FreeTextAffordance,
  type FreeTextAffordance as FreeTextAffordanceValue,
} from './affordance.ts';
export { OPERATIONS, PRODUCT_NAME, toolName, toolPrefix, type Operation } from './naming.ts';
export { definePlugin, PluginDescriptor, type Plugin } from './plugin.ts';
