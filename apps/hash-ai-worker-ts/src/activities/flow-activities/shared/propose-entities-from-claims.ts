import type { BaseUrl } from "@local/hash-graph-types/ontology";
import type {
  ProposedEntity,
  WorkerIdentifiers,
} from "@local/hash-isomorphic-utils/flows/types";

import type { DereferencedEntityTypesByTypeId } from "../../infer-entities/inference-types.js";
import { logger } from "../../shared/activity-logger.js";
import type { DereferencedEntityType } from "../../shared/dereference-entity-type.js";
import { getFlowContext } from "../../shared/get-flow-context.js";
import { logProgress } from "../../shared/log-progress.js";
import { stringify } from "../../shared/stringify.js";
import type { ExistingEntitySummary } from "../research-entities-action/coordinating-agent/summarize-existing-entities.js";
import type { Claim } from "./claims.js";
import type { LocalEntitySummary } from "./infer-summaries-then-claims-from-text/get-entity-summaries-from-text.js";
import { proposeEntityFromClaimsAgent } from "./propose-entities-from-claims/propose-entity-from-claims-agent.js";

export const proposeEntitiesFromClaims = async (params: {
  entitySummaries: LocalEntitySummary[];
  potentialLinkTargetEntitySummaries: LocalEntitySummary[];
  existingEntitySummaries?: ExistingEntitySummary[];
  existingProposals: ProposedEntity[];
  claims: Claim[];
  dereferencedEntityTypes: DereferencedEntityTypesByTypeId;
  workerIdentifiers: WorkerIdentifiers;
}): Promise<{ proposedEntities: ProposedEntity[] }> => {
  const {
    entitySummaries,
    existingEntitySummaries,
    existingProposals,
    dereferencedEntityTypes,
    claims,
    potentialLinkTargetEntitySummaries,
    workerIdentifiers,
  } = params;

  const { stepId } = await getFlowContext();

  const proposedEntities = await Promise.all(
    entitySummaries.map(async (entitySummary) => {
      const entityTypes = entitySummary.entityTypeIds.map((entityTypeId) => {
        const entityType = dereferencedEntityTypes[entityTypeId];

        if (!entityType) {
          throw new Error(
            `Could not find entity type for entity summary: ${JSON.stringify(
              entitySummary,
            )}`,
          );
        }

        return entityType;
      });

      const claimsWithEntityAsSubject = claims.filter(
        (claim) => claim.subjectEntityLocalId === entitySummary.localId,
      );

      const claimsWithEntityAsObject = claims.filter(
        (claim) => claim.objectEntityLocalId === entitySummary.localId,
      );

      const possibleLinkTypesFromEntity: {
        schema: DereferencedEntityType;
        simplifiedPropertyTypeMappings: Record<string, BaseUrl>;
      }[] = Object.entries(dereferencedEntityTypes)
        .filter(([entityTypeId]) =>
          entityTypes.some((entityType) =>
            Object.keys(entityType.schema.links ?? {}).includes(entityTypeId),
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
        const someClaimIncludesTargetEntityAsObject =
          claimsWithEntityAsSubject.some((claim) =>
            "localId" in potentialTargetEntitySummary
              ? claim.objectEntityLocalId ===
                potentialTargetEntitySummary.localId
              : claim.objectEntityLocalId ===
                potentialTargetEntitySummary.entityId,
          );

        const entityIsValidTarget = entityTypes
          .flatMap((entityType) => Object.values(entityType.schema.links ?? {}))
          .find((linkSchema) => {
            const destinationConstraints =
              "oneOf" in linkSchema.items ? linkSchema.items.oneOf : null;

            return (
              !destinationConstraints ||
              destinationConstraints.some((schema) =>
                /**
                 * @todo H-3363 account for parent types
                 */
                potentialTargetEntitySummary.entityTypeIds.includes(
                  schema.$ref,
                ),
              )
            );
          });

        return someClaimIncludesTargetEntityAsObject && entityIsValidTarget;
      });

      logger.debug(`Proposing "${entitySummary.name}" entity with claims`);

      /**
       * @todo: consider batching requests made to the LLM so we propose multiple entities
       * in a single LLM requests, to reduce the number of requests made to LLM providers.
       */
      const proposeEntityFromClaimsStatus = await proposeEntityFromClaimsAgent({
        entitySummary,
        claims: {
          isObjectOf: claimsWithEntityAsObject,
          isSubjectOf: claimsWithEntityAsSubject,
        },
        dereferencedEntityTypes: entityTypes.map(
          (entityType) => entityType.schema,
        ),
        simplifiedPropertyTypeMappings: entityTypes.reduce(
          (prev, entityType) => ({
            ...prev,
            ...entityType.simplifiedPropertyTypeMappings,
          }),
          {},
        ),
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

      if (proposeEntityFromClaimsStatus.status !== "ok") {
        logger.error(
          `Failed to propose entity from claims: ${stringify(
            proposeEntityFromClaimsStatus,
          )}`,
        );

        return [];
      }

      const { proposedEntity, proposedOutgoingLinkEntities } =
        proposeEntityFromClaimsStatus;

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
      isUpdateToExistingProposal: existingProposals.some(
        (proposal) => proposal.localEntityId === entity.localEntityId,
      ),
      ...workerIdentifiers,
    })),
  );

  return { proposedEntities };
};
