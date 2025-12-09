/**
 * Entity Proposal Agent
 *
 * Converts claims into full entity proposals with properties.
 * Each property value is linked back to the claims that support it.
 *
 * Ported from: hash-ai-worker-ts/src/activities/flow-activities/shared/
 *   propose-entities-from-claims/propose-entity-from-claims-agent.ts
 */

import { Agent } from "@mastra/core/agent";

import { abandonEntityTool } from "../tools/ner-abandon-entity";
import { proposeEntityTool } from "../tools/ner-propose-entity";

/**
 * Entity Proposal Agent
 *
 * Uses LLM reasoning to convert claims into entity property values.
 * Each property is linked to the claims that support it.
 */
export const entityProposalAgent = new Agent({
  id: "entity-proposal-agent",
  name: "Entity Proposal Agent",
  instructions: `You are an entity proposal agent.

I will provide you with:
- Entity: The entity to propose (name and summary)
- Claims: A list of claims about the entity (each with a claimId and text)
- Entity Type Schema: The properties this entity type has

Your job is to:
1. Read through all the claims about the entity
2. Extract property values from the claims
3. For each property, specify which claim(s) support that value

IMPORTANT RULES:
1. Fill out as many properties as possible - do not optimize for short responses
2. The provided claims are your ONLY source of information
3. Do not rely on external knowledge about the entities
4. Each property value must be supported by at least one claim
5. Track which claimIds you used for each property

If you cannot fill out ANY meaningful properties, use the abandonEntity tool instead.

Use the proposeEntity tool to submit the entity with all its properties.`,
  model: "openrouter/google/gemini-2.5-flash-lite",
  tools: {
    proposeEntity: proposeEntityTool,
    abandonEntity: abandonEntityTool,
  },
});
