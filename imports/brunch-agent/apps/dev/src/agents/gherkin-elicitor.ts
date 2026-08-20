'use agent';
/**
 * The gherkin elicitor (spec §12.5: one agent per target).
 *
 * Named as a noun — the thing, not the act — and read target-first, so the
 * family sorts together as targets multiply: `gherkin-elicitor`,
 * `assurance-elicitor`.
 *
 * The product is the harness library in a thin host-authored agent — Flue's
 * build-time scan makes the alternative structurally unavailable, since a
 * library cannot ship a pre-registered agent (spec §12.1). So this module is
 * deliberately thin: it mounts harness capability and holds no elicitation
 * semantics of its own.
 *
 * Three recorded Flue constraints are honoured here by construction (spec §10):
 * the `'use agent'` directive is the file's first statement; `agentName` is a
 * pinned string literal, because conversation storage keys on it; and the tool
 * set is static, because prompt-cache economics forbid per-question tool
 * swapping.
 */

import { askTool } from '@brunch/binding-flue';
import { gherkin } from '@brunch/plugin-gherkin';
import { useModel, useTool, type AgentProps } from '@flue/runtime';
import * as v from 'valibot';

export function GherkinElicitor(_props: AgentProps) {
  useModel('anthropic/claude-haiku-4-5');
  useTool(askTool);

  return `You are interviewing someone about ${gherkin.targetDomain}.`;
}

/**
 * Pinned, and never to be edited: conversation storage keys on this literal,
 * so changing it orphans every existing conversation. Flue requires a string
 * literal here because build targets derive durable identifiers from it before
 * any user code runs.
 *
 * Product-prefixed on purpose, and this is the one place the prefix is not
 * cosmetic. Agent identities are global per application, and the September
 * demo shell is chartered to mount this library alongside the Petrinaut
 * libraries — a bare `gherkin-elicitor` could collide with another library's
 * agent, and the collision would land on durable conversation storage.
 *
 * The exported symbol stays the shorter `GherkinElicitor` because it reads
 * better at the mount site; `agentName` exists precisely to let durable
 * identity and source-level name differ.
 */
GherkinElicitor.agentName = 'brunch-gherkin-elicitor';

/**
 * Session→document binding (spec §9.1, adjudication L4): a new session's
 * `initialData` carries the target-document id, validated once at creation and
 * immutable thereafter — Flue's own lane for a target descriptor. Dispatching
 * to an existing conversation id resumes that session against the current state
 * of its target-document.
 */
GherkinElicitor.initialData = v.object({
  targetDocumentId: v.pipe(v.string(), v.nonEmpty()),
});
