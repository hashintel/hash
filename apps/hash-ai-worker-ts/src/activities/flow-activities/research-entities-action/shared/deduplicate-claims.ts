import type { EnforcedEntityEditionProvenance } from "@local/hash-graph-sdk/entity";
import type { PropertyPatchOperation } from "@local/hash-graph-types/entity";
import type { BaseUrl } from "@local/hash-graph-types/ontology";
import { createDefaultAuthorizationRelationships } from "@local/hash-isomorphic-utils/graph-queries";
import type { ClaimProperties } from "@local/hash-isomorphic-utils/system-types/claim";

import { logger } from "../../../../shared/logger.js";
import { getAiAssistantAccountIdActivity } from "../../../get-ai-assistant-account-id-activity.js";
import { getFlowContext } from "../../../shared/get-flow-context.js";
import { graphApiClient } from "../../../shared/graph-api-client.js";
import type { Claim } from "../../shared/claims.js";
import { claimTextualContentFromClaim } from "../../shared/claims.js";

const noneSymbol = Symbol("none");

/**
 * Deduplicates claims about an entity according to the following rules:
 * 1. Any claim about the same entity with identical 'text' and an identical objectEntityId (including none) is a duplicate
 * 2. Claims with difference objectEntityIds are not duplicates (including one missing, one defined)
 * 3. Sources for the claim are merged into the first claim encountered
 * 4. Prepositional phrases for the claim are merged into the first claim encountered
 * 5. The first claim encountered is kept, any subsequent are archived after taking their sources and prepositional phrases
 *
 * A better approach would rely on 'confidence' ratings for each claim, which could be used to determine which claim to keep,
 * e.g. in the case of competing objectEntityIds.
 *
 * @return A new array containing the deduplicated claims. The original array and its objects are not modified.
 */
export const deduplicateClaims = async (
  inputClaims: Claim[],
): Promise<Claim[]> => {
  const { flowEntityId, stepId, userAuthentication, webId } =
    await getFlowContext();

  /**
   * Simplify identification of duplicate claims.
   */
  const claimsByEntityIdObjectAndText: {
    [entityId: string]: {
      [objectEntityId: string | symbol]: {
        [claimText: string]: Claim;
      };
    };
  } = {};

  const aiAssistantAccountId = await getAiAssistantAccountIdActivity({
    authentication: userAuthentication,
    grantCreatePermissionForWeb: webId,
    graphApiClient,
  });

  if (!aiAssistantAccountId) {
    throw new Error(`Failed to get the AI Assistant account for web ${webId}`);
  }

  for (const currentClaimInLoop of inputClaims) {
    const entityId = currentClaimInLoop.subjectEntityLocalId;
    const objectEntityId = currentClaimInLoop.objectEntityLocalId ?? noneSymbol;

    claimsByEntityIdObjectAndText[entityId] ??= {};
    claimsByEntityIdObjectAndText[entityId][objectEntityId] ??= {};

    const originalIdentifiedClaim =
      claimsByEntityIdObjectAndText[entityId][objectEntityId][
        currentClaimInLoop.text
      ];

    if (!originalIdentifiedClaim) {
      claimsByEntityIdObjectAndText[entityId][objectEntityId][
        currentClaimInLoop.text
      ] = currentClaimInLoop;
      continue;
    }

    const newClaimObject = {
      ...originalIdentifiedClaim,
    };

    const mergedPrepositionalPhrases = Array.from(
      new Set([
        ...originalIdentifiedClaim.prepositionalPhrases,
        ...currentClaimInLoop.prepositionalPhrases,
      ]),
    );

    newClaimObject.prepositionalPhrases = mergedPrepositionalPhrases;

    const mergedSources = [
      ...(originalIdentifiedClaim.sources ?? []),
      ...(currentClaimInLoop.sources ?? []).filter(
        (source) =>
          !originalIdentifiedClaim.sources?.some(
            (existingSource) =>
              existingSource.location?.uri === source.location?.uri,
          ),
      ),
    ];

    newClaimObject.sources = mergedSources;

    const provenance: EnforcedEntityEditionProvenance = {
      actorType: "ai",
      origin: {
        id: flowEntityId,
        stepIds: [stepId],
        type: "flow",
      },
      sources: mergedSources,
    };

    /**
     * @todo H-3307: Use graph 'merge' feature once available (H-3306), instead of these separate patches.
     */
    await graphApiClient.patchEntity(aiAssistantAccountId, {
      entityId: newClaimObject.claimId,
      properties: [
        {
          op: "replace",
          path: [
            "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/" satisfies keyof ClaimProperties as BaseUrl,
          ],
          property: {
            metadata: {
              provenance,
            },
            value: claimTextualContentFromClaim(newClaimObject),
          },
        },
      ] satisfies PropertyPatchOperation[],
      provenance: {
        ...provenance,
        origin: {
          ...provenance.origin,
          // @ts-expect-error –– ProvidedEntityEditionProvenanceOriginTypeEnum is not generated correctly in the hash-graph-client
          type: provenance.origin.type satisfies "migration",
        },
      },
      relationships: createDefaultAuthorizationRelationships({
        actorId: userAuthentication.actorId,
      }),
    });

    await graphApiClient.patchEntity(aiAssistantAccountId, {
      entityId: currentClaimInLoop.claimId,
      archived: true,
      provenance: {
        ...provenance,
        origin: {
          ...provenance.origin,
          // @ts-expect-error –– ProvidedEntityEditionProvenanceOriginTypeEnum is not generated correctly in the hash-graph-client
          type: provenance.origin.type satisfies "migration",
        },
      },
    });

    logger.debug(
      `Merged claim ${JSON.stringify(currentClaimInLoop)} into ${JSON.stringify(originalIdentifiedClaim)}`,
    );
  }

  return Object.values(claimsByEntityIdObjectAndText).flatMap((objectAndText) =>
    Object.values(objectAndText).flatMap((textToClaim) =>
      Object.values(textToClaim),
    ),
  );
};
