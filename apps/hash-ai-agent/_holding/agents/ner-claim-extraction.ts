/**
 * Claim Extraction Agent
 *
 * Extracts structured claims about entities from text.
 * Claims follow subject-predicate-object format with prepositional phrases.
 *
 * Ported from: hash-ai-worker-ts/src/activities/flow-activities/shared/
 *   infer-summaries-then-claims-from-text/infer-entity-claims-from-text-agent.ts
 */

import { Agent } from "@mastra/core/agent";

import { submitClaimsTool } from "../tools/ner-submit-claims";

/**
 * Claim Extraction Agent
 *
 * Uses LLM reasoning to extract structured claims about entities.
 * Each claim follows subject-predicate-object format.
 */
export const claimExtractionAgent = new Agent({
  id: "claim-extraction-agent",
  name: "Claim Extraction Agent",
  instructions: `You are a claim extracting agent. Your job is to consider content and identify claims about entities from within it.

The user will provide you with:
- Text: the text from which you should extract claims
- Goal: A prompt specifying what entities or claims you should focus on
- Subject Entities: the entities that claims should be about (with localId, name, summary)
- Entity Type Properties: the properties of interest for these entities
- Potential Object Entities: other entities that may be the object of claims

CLAIM FORMAT:
Each claim should be in the format: <subject> <predicate> <object>
Example: { text: "Company X acquired Company Y.", prepositionalPhrases: ["in 2019", "for $10 million"], subjectEntityLocalId: "companyX-123", objectEntityLocalId: "companyY-456" }

IMPORTANT RULES:
1. Each claim MUST start with one of the subject entities' names, exactly as provided
2. Don't include claims without a valid subject entity - omit them instead
3. If a claim relates to another entity, include its objectEntityLocalId
4. Prepositional phrases provide context (dates, amounts, locations) - don't include them in the main claim text

DON'T include claims like:
- "Bill Gates has a LinkedIn URL" (no value provided)
- "Bill Gates's LinkedIn URL is <UNKNOWN>" (unknown value)
- "Bill Gates's LinkedIn URL is not in the text" (missing information)

DO include claims like:
- "Bill Gates's LinkedIn URL is https://www.linkedin.com/in/williamhgates" (actual value from text)

Or simply omit the claim if the value is not known.

Be exhaustive - if information about a subject entity's properties exists in the text, include it as a claim.

Use the submitClaims tool to submit all extracted claims.`,
  model: "openrouter/google/gemini-2.5-flash-lite",
  tools: {
    submitClaims: submitClaimsTool,
  },
});
