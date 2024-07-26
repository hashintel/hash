import type { BaseUrl } from "@local/hash-graph-types/ontology";
import type { ProposedEntity } from "@local/hash-isomorphic-utils/flows/types";

import type { DereferencedEntityTypesByTypeId } from "../../infer-entities/inference-types.js";
import { logger } from "../../shared/activity-logger.js";
import type { DereferencedEntityType } from "../../shared/dereference-entity-type.js";
import { getFlowContext } from "../../shared/get-flow-context.js";
import { logProgress } from "../../shared/log-progress.js";
import { stringify } from "../../shared/stringify.js";
import type { ExistingEntitySummary } from "../research-entities-action/summarize-existing-entities.js";
import type { LocalEntitySummary } from "./infer-claims-from-text/get-entity-summaries-from-text.js";
import type { Claim } from "./infer-claims-from-text/types.js";
import { proposeEntityFromClaimsAgent } from "./propose-entities-from-claims/propose-entity-from-claims-agent.js";

export const proposeEntitiesFromClaims = async (params: {
  entitySummaries: LocalEntitySummary[];
  potentialLinkTargetEntitySummaries: LocalEntitySummary[];
  existingEntitySummaries?: ExistingEntitySummary[];
  claims: Claim[];
  dereferencedEntityTypes: DereferencedEntityTypesByTypeId;
}): Promise<{ proposedEntities: ProposedEntity[] }> => {
  const {
    entitySummaries,
    existingEntitySummaries,
    dereferencedEntityTypes,
    claims,
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

      const claimsWithEntityAsSubject = claims.filter(
        (claim) => claim.subjectEntityLocalId === entitySummary.localId,
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
        const someClaimIncludesTargetEntityAsObject =
          claimsWithEntityAsSubject.some((claim) =>
            "localId" in potentialTargetEntitySummary
              ? claim.objectEntityLocalId ===
                potentialTargetEntitySummary.localId
              : claim.objectEntityLocalId ===
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

        return someClaimIncludesTargetEntityAsObject && entityIsValidTarget;
      });

      logger.debug(
        `Proposing "${entitySummary.name}" entity with claims: ${stringify(
          claimsWithEntityAsSubject,
        )}`,
      );

      /**
       * @todo: consider batching requests made to the LLM so we propose multiple entities
       * in a single LLM requests, to reduce the number of requests made to LLM providers.
       */
      const proposeEntityFromClaimsStatus = await proposeEntityFromClaimsAgent({
        entitySummary,
        claims: claimsWithEntityAsSubject,
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
    })),
  );

  return { proposedEntities };
};
