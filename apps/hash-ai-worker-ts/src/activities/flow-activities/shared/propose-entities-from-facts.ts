import type { BaseUrl } from "@local/hash-graph-types/ontology";
import type { ProposedEntity } from "@local/hash-isomorphic-utils/flows/types";

import type { DereferencedEntityTypesByTypeId } from "../../infer-entities/inference-types";
import { logger } from "../../shared/activity-logger";
import type { DereferencedEntityType } from "../../shared/dereference-entity-type";
import { stringify } from "../../shared/stringify";
import type { ExistingEntitySummary } from "../research-entities-action/summarize-existing-entities";
import type { LocalEntitySummary } from "./infer-facts-from-text/get-entity-summaries-from-text";
import type { Fact } from "./infer-facts-from-text/types";
import { proposeEntityFromFacts } from "./propose-entities-from-facts/propose-entity-from-facts";

export const proposeEntitiesFromFacts = async (params: {
  entitySummaries: LocalEntitySummary[];
  existingEntitySummaries?: ExistingEntitySummary[];
  facts: Fact[];
  dereferencedEntityTypes: DereferencedEntityTypesByTypeId;
}): Promise<{ proposedEntities: ProposedEntity[] }> => {
  const {
    entitySummaries,
    existingEntitySummaries,
    dereferencedEntityTypes,
    facts,
  } = params;

  const proposedEntities = await Promise.all(
    entitySummaries.map(async (entitySummary) => {
      const { schema: dereferencedEntityType, simplifiedPropertyTypeMappings } =
        dereferencedEntityTypes[entitySummary.entityTypeId] ?? {};

      if (!dereferencedEntityType) {
        throw new Error(
          `Could not find dereferenced entity type for entity summary: ${JSON.stringify(entitySummary)}`,
        );
      }

      if (!simplifiedPropertyTypeMappings) {
        throw new Error(
          `Could not find simplified property type mappings for entity summary: ${JSON.stringify(entitySummary)}`,
        );
      }

      const factsWithEntityAsSubject = facts.filter(
        (fact) => fact.subjectEntityLocalId === entitySummary.localId,
      );

      const proposeOutgoingLinkEntityTypes: {
        schema: DereferencedEntityType;
        simplifiedPropertyTypeMappings: Record<string, BaseUrl>;
      }[] = Object.entries(dereferencedEntityTypes)
        .filter(([entityTypeId]) =>
          Object.keys(dereferencedEntityType.links ?? {}).includes(
            entityTypeId,
          ),
        )
        .map(
          ([
            _,
            {
              schema,
              simplifiedPropertyTypeMappings:
                outgoingLinkEntityTypeSimplifiedPropertyTypeMappings,
            },
          ]) => {
            if (!outgoingLinkEntityTypeSimplifiedPropertyTypeMappings) {
              throw new Error(
                `Could not find simplified property type mappings for entity summary: ${JSON.stringify(
                  entitySummary,
                )}`,
              );
            }

            return {
              schema,
              simplifiedPropertyTypeMappings:
                outgoingLinkEntityTypeSimplifiedPropertyTypeMappings,
            };
          },
        );

      const possibleOutgoingLinkTargetEntitySummaries = [
        ...entitySummaries,
        ...(existingEntitySummaries ?? []),
      ].filter((potentialTargetEntitySummary) => {
        const someFactIncludesTargetEntityAsObject =
          factsWithEntityAsSubject.some((fact) =>
            "localId" in potentialTargetEntitySummary
              ? fact.objectEntityLocalId ===
                potentialTargetEntitySummary.localId
              : fact.objectEntityLocalId ===
                potentialTargetEntitySummary.entityId,
          );

        return someFactIncludesTargetEntityAsObject;
      });

      /**
       * @todo: consider batching requests made to the LLM so we propose multiple entities
       * in a single LLM requests, to reduce the number of requests made to LLM providers.
       */
      const proposeEntityFromFactsStatus = await proposeEntityFromFacts({
        entitySummary,
        facts: factsWithEntityAsSubject,
        dereferencedEntityType,
        simplifiedPropertyTypeMappings,
        /**
         * We only propose outgoing links if there is more than one possible
         * target for the link.
         */
        proposeOutgoingLinkEntityTypes:
          possibleOutgoingLinkTargetEntitySummaries.length > 0
            ? proposeOutgoingLinkEntityTypes
            : [],
        possibleOutgoingLinkTargetEntitySummaries,
      });

      if (proposeEntityFromFactsStatus.status !== "ok") {
        logger.error(
          `Failed to propose entity from facts: ${stringify(proposeEntityFromFactsStatus)}`,
        );

        return [];
      }

      const { proposedEntity, proposedOutgoingLinkEntities } =
        proposeEntityFromFactsStatus;

      return [proposedEntity, ...proposedOutgoingLinkEntities];
    }),
  ).then((unflattenedProposedEntities) => unflattenedProposedEntities.flat());

  return { proposedEntities };
};
