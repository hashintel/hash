import type { BaseUrl } from "@local/hash-graph-types/ontology";
import type { ProposedEntity } from "@local/hash-isomorphic-utils/flows/types";

import type { DereferencedEntityTypesByTypeId } from "../../infer-entities/inference-types.js";
import { logger } from "../../shared/activity-logger.js";
import type { DereferencedEntityType } from "../../shared/dereference-entity-type.js";
import { getFlowContext } from "../../shared/get-flow-context.js";
import { logProgress } from "../../shared/log-progress.js";
import { stringify } from "../../shared/stringify.js";
import type { ExistingEntitySummary } from "../research-entities-action/summarize-existing-entities.js";
import type { LocalEntitySummary } from "./infer-facts-from-text/get-entity-summaries-from-text.js";
import type { Fact } from "./infer-facts-from-text/types.js";
import { proposeEntityFromFactsAgent } from "./propose-entities-from-facts/propose-entity-from-facts-agent.js";

export const proposeEntitiesFromFacts = async (params: {
  entitySummaries: LocalEntitySummary[];
  potentialLinkTargetEntitySummaries: LocalEntitySummary[];
  existingEntitySummaries?: ExistingEntitySummary[];
  facts: Fact[];
  dereferencedEntityTypes: DereferencedEntityTypesByTypeId;
}): Promise<{ proposedEntities: ProposedEntity[] }> => {
  const {
    entitySummaries,
    existingEntitySummaries,
    dereferencedEntityTypes,
    facts,
    potentialLinkTargetEntitySummaries,
  } = params;

  const { stepId } = await getFlowContext();

  const proposedEntities = await Promise.all(
    entitySummaries.map(async (entitySummary) => {
      const { schema: dereferencedEntityType, simplifiedPropertyTypeMappings } =
        dereferencedEntityTypes[entitySummary.entityTypeId] ?? {};

      if (!dereferencedEntityType) {
        throw new Error(
          `Could not find dereferenced entity type for entity summary: ${JSON.stringify(
            entitySummary,
          )}`,
        );
      }

      if (!simplifiedPropertyTypeMappings) {
        throw new Error(
          `Could not find simplified property type mappings for entity summary: ${JSON.stringify(
            entitySummary,
          )}`,
        );
      }

      const factsWithEntityAsSubject = facts.filter(
        (fact) => fact.subjectEntityLocalId === entitySummary.localId,
      );

      const possibleLinkTypesFromEntity: {
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
        ...potentialLinkTargetEntitySummaries,
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

        const entityIsValidTarget = Object.values(
          dereferencedEntityType.links ??
            ({} as NonNullable<DereferencedEntityType["links"]>),
        ).find((linkSchema) => {
          const destinationConstraints =
            "oneOf" in linkSchema.items ? linkSchema.items.oneOf : null;

          return (
            !destinationConstraints ||
            destinationConstraints.some(
              (schema) =>
                schema.$ref === potentialTargetEntitySummary.entityTypeId,
            )
          );
        });

        return someFactIncludesTargetEntityAsObject && entityIsValidTarget;
      });

      logger.debug(
        `Proposing "${entitySummary.name}" entity with facts: ${stringify(
          factsWithEntityAsSubject,
        )}`,
      );

      /**
       * @todo: consider batching requests made to the LLM so we propose multiple entities
       * in a single LLM requests, to reduce the number of requests made to LLM providers.
       */
      const proposeEntityFromFactsStatus = await proposeEntityFromFactsAgent({
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
            ? possibleLinkTypesFromEntity
            : [],
        possibleOutgoingLinkTargetEntitySummaries,
      });

      if (proposeEntityFromFactsStatus.status !== "ok") {
        logger.error(
          `Failed to propose entity from facts: ${stringify(
            proposeEntityFromFactsStatus,
          )}`,
        );

        return [];
      }

      const { proposedEntity, proposedOutgoingLinkEntities } =
        proposeEntityFromFactsStatus;

      return [proposedEntity, ...proposedOutgoingLinkEntities];
    }),
  ).then((unflattenedProposedEntities) => unflattenedProposedEntities.flat());

  const now = new Date().toISOString();

  logProgress(
    proposedEntities.map((entity) => ({
      type: "ProposedEntity",
      proposedEntity: entity,
      stepId,
      recordedAt: now,
    })),
  );

  return { proposedEntities };
};
