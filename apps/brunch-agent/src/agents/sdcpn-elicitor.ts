"use agent";
/**
 * The SDCPN elicitor (spec §12.5: one agent per target).
 *
 * The second entry in the target gallery, and the first whose plugin is a
 * file: `@hashintel/brunch-agent-plugin-sdcpn` loads `plugin.yaml` and the
 * harness reads its cells (ADR-0006, ADR-0007). This module is as thin as the
 * gherkin one — it mounts harness capability and holds no elicitation
 * semantics of its own; what the interviewer asks, demands, and treats as
 * complete all comes from the plugin file through the binding.
 *
 * The same three recorded Flue constraints hold here by construction
 * (spec §10): `'use agent'` is the file's first statement; `agentName` is a
 * pinned string literal; the tool set is static.
 */

import { useInitialData, useModel, type AgentProps } from "@flue/runtime";
import * as v from "valibot";

import { useElicitation } from "@hashintel/brunch-agent-binding-flue";
import { sdcpn } from "@hashintel/brunch-agent-plugin-sdcpn";

import { createSdcpnElicitationSession } from "../elicitation-session.ts";

/**
 * One definition for the agent and any faux provider alike (see the gherkin
 * elicitor). `BRUNCH_SDCPN_MODEL` overrides the default so an evaluation
 * runner can drive this same agent with a stronger model without a second
 * agent definition; the override is read once, at module load, like the rest
 * of the agent's static configuration.
 */
export const SDCPN_MODEL_ID =
  process.env["BRUNCH_SDCPN_MODEL"] || "claude-haiku-4-5";

const sdcpnElicitorInitialData = v.object({
  targetDocumentId: v.pipe(v.string(), v.nonEmpty()),
});

export function SdcpnElicitor(props: AgentProps) {
  useModel(`anthropic/${SDCPN_MODEL_ID}`);
  const initialData =
    useInitialData<v.InferOutput<typeof sdcpnElicitorInitialData>>();
  return useElicitation(
    sdcpn,
    createSdcpnElicitationSession(props.id, initialData.targetDocumentId),
  );
}

/**
 * Pinned, and never to be edited: conversation storage keys on this literal,
 * so changing it orphans every existing conversation. Product-prefixed for the
 * same reason as the gherkin elicitor — agent identities are global per
 * application and the demo shell mounts this library beside others.
 */
SdcpnElicitor.agentName = "brunch-sdcpn-elicitor";

/**
 * Session→document binding (spec §9.1): `initialData` carries the
 * target-document id, validated once at creation and immutable thereafter.
 */
SdcpnElicitor.initialData = sdcpnElicitorInitialData;
