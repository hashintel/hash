import type { EntityId, VersionedUrl } from "@blockprotocol/type-system";
import { runEvals } from "@mastra/core/evals";
import dedent from "dedent";
import { describe, expect, test } from "vitest";

import { entitySummaryFixtures } from "../fixtures/entity-summary-fixtures";
import { entitySummariesCompositeScorer } from "../scorers/entity-summaries-scorer";
import type { DereferencedEntityType } from "../utils/dereference-entity-type";
import { entitySummaryAgent } from "./entity-summary-agent";

export type LocalEntitySummary = {
  localId: EntityId;
  name: string;
  summary: string;
  entityTypeIds: [VersionedUrl, ...VersionedUrl[]];
};

function buildUserMessage({
  text: context,
  dereferencedEntityTypes,
  relevantEntitiesPrompt,
  existingSummaries = [],
}: {
  text: string;
  existingSummaries: LocalEntitySummary[];
  dereferencedEntityTypes: Pick<
    DereferencedEntityType,
    "$id" | "title" | "description"
  >[];
  relevantEntitiesPrompt: string;
}) {
  return dedent(`
    Here is the text to identify entities from:
    <Text>${context}</Text>

    Here are the entity types we already know about – either specify the EntityTypeId of one of these, or suggest a new type using a plain English title:
    <KnownEntityTypes>
    ${dereferencedEntityTypes
      .map(
        (dereferencedEntityType) =>
          `<EntityType>
            EntityTypeId: ${dereferencedEntityType.$id}
            Title: ${dereferencedEntityType.title}
            Description: ${dereferencedEntityType.description}
          </EntityType>`,
      )
      .join("\n")}
    </KnownEntityTypes>

    Here is the research goal – please identify all entities in the text which may be relevant to this goal, including entities with relationships to relevant entities.
    <ResearchGoal>
    ${relevantEntitiesPrompt}
    </ResearchGOal>

    ${
      existingSummaries.length
        ? dedent(`<ExistingEntities>
    We already have summaries for the following entities – please don't include them in your response:
    ${existingSummaries
      .map((summary) =>
        dedent(`<ExistingEntity>
        Name: ${summary.name}
        Summary: ${summary.summary}
        ${summary.entityTypeIds.length > 1 ? "Types" : "Type"}: ${summary.entityTypeIds.join(", ")}
      </ExistingEntity>`),
      )
      .join("\n")}
    </ExistingEntities>`)
        : ""
    }
  `);
}

describe("Entity Summaries Agent", () => {
  test.for(entitySummaryFixtures)(
    "$name",
    { timeout: 5 * 60 * 1000 }, // 5 minutes - LLM calls take time
    async ({
      entityType,
      relevantEntitiesPrompt,
      context,
      goldEntities,
      irrelevantEntities,
      wrongTypeEntities,
    }) => {
      const result = await runEvals({
        data: [
          {
            input: buildUserMessage({
              dereferencedEntityTypes: [entityType],
              existingSummaries: [],
              relevantEntitiesPrompt,
              text: context,
            }),
            groundTruth: {
              goldEntities,
              irrelevantEntities,
              wrongTypeEntities,
            },
          },
        ],
        target: entitySummaryAgent,
        scorers: [entitySummariesCompositeScorer],
      });

      // Assert aggregate score meets threshold
      expect(result.scores["entity-summaries"]).toBeGreaterThan(0.5);
    },
  );
});
