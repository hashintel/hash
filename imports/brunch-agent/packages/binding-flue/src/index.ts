/**
 * `@brunch/binding-flue` — the Flue binding.
 *
 * One binding per substrate. It implements the substrate-capability list
 * (spec §10), owns the storage-port implementation (spec §9.6), and is the
 * only shell allowed to know Flue's dialect: **the harness imports no
 * substrate; a binding imports both** (spec §4).
 *
 * Every time mechanism wants to land in here, the second-binding test applies
 * (spec §14.2): genuinely substrate-specific, or mechanism leaking into Flue's
 * dialect?
 */

import { toolName } from '@brunch/core';
import { defineTool } from '@flue/runtime';
import * as v from 'valibot';

export { CAPABILITIES, type Capability, type Provision } from './capabilities.ts';

/**
 * The ask tool — capability 5, which Flue does not provide natively.
 *
 * Flue has no ask-the-user primitive, so the harness owns the turn-suspension
 * protocol: a `terminate: true` ask tool, the pending affordance in
 * per-session state, and the answer arriving as a fresh dispatch (spec §7.4).
 *
 * **Scaffold only.** What is fixed here is the seam — the tool's name derives
 * from core's abstract operation, and its schema is Valibot like every other
 * boundary. Suspension, the pending-affordance slot, and mechanical reply
 * binding are the walking skeleton's work, not this slice's.
 */
export const askTool = defineTool({
  name: toolName('ask'),
  description: 'Ask the person a question and suspend the turn until they reply.',
  input: v.object({
    question: v.pipe(v.string(), v.nonEmpty()),
  }),
  run: () => {
    throw new Error(
      'The ask tool is scaffolding: turn suspension and reply binding land with the walking skeleton (FE-1389).',
    );
  },
});
