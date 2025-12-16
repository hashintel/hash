import type { EntityId, EntityUuid, VersionedUrl, WebId } from '@blockprotocol/type-system';
import { entityIdFromComponents } from '@blockprotocol/type-system';
import { generateUuid } from '@local/hash-isomorphic-utils/generate-uuid';
import { runEvals } from '@mastra/core/evals';
import { createCompletenessScorer } from '@mastra/evals/scorers/prebuilt';
import dedent from 'dedent';
import { describe, expect, test } from 'vitest';

import { type InferClaimsFixture, inferClaimsFixtures } from '../../fixtures/_old/infer-claims-fixtures';
import { claimsStructureScorer } from '../../scorers/claims-scorer';
import { claimExtractionsAgent } from './claim-extraction-agent';
import { entitySummaryAgent } from './entity-summary-agent';

/**
 * Type for entity summaries extracted by the entity summary agent.
 */
type LocalEntitySummary = {
  localId: EntityId;
  name: string;
  summary: string;
  entityTypeIds: [VersionedUrl, ...VersionedUrl[]];
};

/**
 * Build user message for entity summary agent.
 */
function buildEntitySummaryMessage(fixture: InferClaimsFixture): string {
  return dedent`
    Here is the text to identify entities from:
    <Text>${fixture.content}</Text>

    Here are the entity types we already know about – either specify the EntityTypeId of one of these, or suggest a new type using a plain English title:
    <KnownEntityTypes>
    ${fixture.entityTypes
      .map(
        (type) => `<EntityType>
      EntityTypeId: ${type.$id}
      Title: ${type.title}
      Description: ${type.description}
    </EntityType>`
      )
      .join('\n')}
    </KnownEntityTypes>

    Here is the research goal – please identify all entities in the text which may be relevant to this goal, including entities with relationships to relevant entities.
    <ResearchGoal>
    ${fixture.goal}
    </ResearchGoal>
  `;
}

/**
 * Build user message for claim extraction agent.
 */
function buildClaimExtractionMessage(
  fixture: InferClaimsFixture,
  discoveredEntities: LocalEntitySummary[]
): string {
  return dedent`
    Here is the text from which to extract claims:
    <Text>${fixture.content}</Text>

    ${fixture.url ? `<URL>${fixture.url}</URL>` : ''}
    ${fixture.title ? `<Title>${fixture.title}</Title>` : ''}

    <Goal>${fixture.goal}</Goal>

    <SubjectEntities>
    ${discoveredEntities
      .map(
        (entity) => `<SubjectEntity>
      LocalId: ${entity.localId}
      Name: ${entity.name}
      Summary: ${entity.summary}
    </SubjectEntity>`
      )
      .join('\n')}
    </SubjectEntities>

    <PotentialObjectEntities>
    ${discoveredEntities
      .map(
        (entity) => `<ObjectEntity>
      LocalId: ${entity.localId}
      Name: ${entity.name}
    </ObjectEntity>`
      )
      .join('\n')}
    </PotentialObjectEntities>

    Extract all claims about the subject entities from the text.
  `;
}

/**
 * Extract discovered entities from agent output (as provided by runEvals).
 */
function extractEntitiesFromOutput(output: unknown): LocalEntitySummary[] {
  if (output == null) {
    return [];
  }

  const webId = generateUuid() as WebId;

  // Cast the output to access toolCalls with proper typing
  // (same pattern as entity-summaries-scorer.ts)
  const outputRecord = output as Record<string, unknown>;

  let toolCalls: { toolName: string; args: unknown }[] = [];
  if (Array.isArray(outputRecord.toolCalls)) {
    toolCalls = outputRecord.toolCalls as { toolName: string; args: unknown }[];
  } else if (Array.isArray(outputRecord)) {
    // Output might be an array of steps/messages
    for (const item of outputRecord) {
      if (
        typeof item === 'object' &&
        item !== null &&
        'toolCalls' in item &&
        Array.isArray((item as Record<string, unknown>).toolCalls)
      ) {
        toolCalls = (item as Record<string, unknown>).toolCalls as {
          toolName: string;
          args: unknown;
        }[];
        break;
      }
    }
  }

  // Find the register call
  const registerCall = toolCalls.find((toolCall) => toolCall.toolName === 'register-entity-summaries');

  if (!registerCall?.args) {
    return [];
  }

  const args = registerCall.args as {
    entitySummaries?: { name: string; summary: string; type: string }[];
  };

  if (!Array.isArray(args.entitySummaries)) {
    return [];
  }

  const entities: LocalEntitySummary[] = [];

  for (const { name, summary, type } of args.entitySummaries) {
    const entityUuid = generateUuid() as EntityUuid;
    const entityId = entityIdFromComponents(webId, entityUuid);

    entities.push({
      localId: entityId,
      name,
      summary,
      entityTypeIds: [type as VersionedUrl],
    });
  }

  return entities;
}

// Simple pass-through scorer to run the entity summary agent
const passThroughScorer = createCompletenessScorer();

describe('Claim Extraction Agent', () => {
  test.for(inferClaimsFixtures)(
    '$name',
    { timeout: 10 * 60 * 1000 }, // 10 minutes - two LLM calls
    async (fixture) => {
      // Step 1: Run entity summary agent to discover entities
      // Use runEvals with onItemComplete to capture the agent output
      let entitySummaryOutput: unknown;

      await runEvals({
        data: [
          {
            input: buildEntitySummaryMessage(fixture),
            groundTruth: {},
          },
        ],
        target: entitySummaryAgent,
        scorers: [passThroughScorer],
        onItemComplete: ({ targetResult }) => {
          entitySummaryOutput = targetResult;
        },
      });

      // Extract discovered entities from the captured output
      const discoveredEntities = extractEntitiesFromOutput(entitySummaryOutput);

      // Verify we found some entities
      expect(discoveredEntities.length).toBeGreaterThan(0);

      // Step 2: Run claim extraction agent and score the results
      const claimsMessage = buildClaimExtractionMessage(fixture, discoveredEntities);

      const evalResult = await runEvals({
        data: [
          {
            input: claimsMessage,
            groundTruth: {
              discoveredEntities: discoveredEntities.map((entity) => ({
                localId: entity.localId,
                name: entity.name,
              })),
            },
          },
        ],
        target: claimExtractionsAgent,
        scorers: [claimsStructureScorer],
      });

      // Assert score meets threshold
      expect(evalResult.scores['claims-structure']).toBeGreaterThan(0.5);
    }
  );
});
