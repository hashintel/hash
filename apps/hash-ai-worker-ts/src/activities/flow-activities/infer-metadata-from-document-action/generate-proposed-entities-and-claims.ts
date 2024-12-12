import type { PropertyProvenance } from "@local/hash-graph-client";
import type { EnforcedEntityEditionProvenance } from "@local/hash-graph-sdk/entity";
import { Entity, LinkEntity } from "@local/hash-graph-sdk/entity";
import type { AccountId } from "@local/hash-graph-types/account";
import type {
  EntityId,
  EntityUuid,
  PropertyMetadataObject,
} from "@local/hash-graph-types/entity";
import type { OwnedById } from "@local/hash-graph-types/web";
import type { ProposedEntity } from "@local/hash-isomorphic-utils/flows/types";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { createDefaultAuthorizationRelationships } from "@local/hash-isomorphic-utils/graph-queries";
import {
  blockProtocolPropertyTypes,
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type {
  Claim as ClaimEntity,
  HasObject,
} from "@local/hash-isomorphic-utils/system-types/claim";
import type {
  InstitutionProperties,
  PersonProperties,
  TextDataTypeMetadata,
} from "@local/hash-isomorphic-utils/system-types/shared";
import { entityIdFromComponents } from "@local/hash-subgraph";
import { Context } from "@temporalio/activity";

import { getFlowContext } from "../../shared/get-flow-context.js";
import { graphApiClient } from "../../shared/graph-api-client.js";
import { logProgress } from "../../shared/log-progress.js";
import type { DocumentMetadata } from "./get-llm-analysis-of-doc.js";

const createClaim = async ({
  claimText,
  creatorActorId,
  draft,
  objectText,
  ownedById,
  propertyProvenance,
  provenance,
  subjectText,
  userActorId,
}: {
  claimText: string;
  creatorActorId: AccountId;
  draft: boolean;
  objectText: string;
  ownedById: OwnedById;
  propertyProvenance: PropertyProvenance;
  provenance: EnforcedEntityEditionProvenance;
  subjectText: string;
  userActorId: AccountId;
}) => {
  return await Entity.create<ClaimEntity>(
    graphApiClient,
    { actorId: creatorActorId },
    {
      draft,
      entityUuid: generateUuid() as EntityUuid,
      entityTypeIds: ["https://hash.ai/@hash/types/entity-type/claim/v/1"],
      ownedById,
      provenance,
      relationships: createDefaultAuthorizationRelationships({
        actorId: userActorId,
      }),
      properties: {
        value: {
          "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/":
            {
              metadata: {
                dataTypeId:
                  "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                provenance: propertyProvenance,
              },
              value: claimText,
            },
          "https://hash.ai/@hash/types/property-type/subject/": {
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
              provenance: propertyProvenance,
            },
            value: subjectText,
          },

          "https://hash.ai/@hash/types/property-type/object/": {
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
              provenance: propertyProvenance,
            },
            value: objectText,
          },
        },
      },
    },
  );
};

export const generateDocumentProposedEntitiesAndCreateClaims = async ({
  aiAssistantAccountId,
  documentMetadata,
  documentEntityId,
  documentTitle,
  provenance,
  propertyProvenance,
}: {
  aiAssistantAccountId: AccountId;
  documentMetadata: Pick<
    DocumentMetadata,
    "authors" | "publicationVenue" | "publishedBy"
  >;
  documentEntityId: EntityId;
  documentTitle: string;
  provenance: EnforcedEntityEditionProvenance;
  propertyProvenance: PropertyProvenance;
}): Promise<ProposedEntity[]> => {
  const {
    authors,
    /** @todo H-3619: Infer info on publisher and venue, and link to docs */
    publicationVenue: _publicationVenue,
    publishedBy: _publishedBy,
  } = documentMetadata;

  const { createEntitiesAsDraft, webId, userAuthentication } =
    await getFlowContext();

  const textDataTypeMetadata: TextDataTypeMetadata = {
    dataTypeId:
      "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
    provenance: propertyProvenance,
  };

  const nameOnlyPropertyMetadata: PropertyMetadataObject = {
    value: {
      [blockProtocolPropertyTypes.name.propertyTypeBaseUrl]: {
        metadata: textDataTypeMetadata,
      },
    },
  };

  const proposedEntities: ProposedEntity[] = [];

  const institutionEntityIdByName: Record<string, EntityId> = {};

  for (const author of authors ?? []) {
    const { name: authorName, affiliatedWith } = author;

    const entityUuid = generateUuid() as EntityUuid;

    const authorProperties: PersonProperties = {
      "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
        authorName,
    };

    const authorEntityId = entityIdFromComponents(webId, entityUuid);

    /**
     * Create a claim about the person having authored the document
     */
    const authorToDocClaim = await createClaim({
      claimText: `${authorName} authored ${documentTitle}`,
      creatorActorId: aiAssistantAccountId,
      draft: createEntitiesAsDraft,
      objectText: documentTitle,
      ownedById: webId,
      propertyProvenance,
      provenance,
      subjectText: authorName,
      userActorId: userAuthentication.actorId,
    });

    /**
     * Link the authorship claim to the document entity
     *
     * @todo H-3152 update persist-entity to handle updates to existing entities, and let claim link creation happen there
     */
    await LinkEntity.create<HasObject>(
      graphApiClient,
      { actorId: aiAssistantAccountId },
      {
        draft: createEntitiesAsDraft,
        entityTypeIds: [systemLinkEntityTypes.hasObject.linkEntityTypeId],
        ownedById: webId,
        provenance,
        linkData: {
          leftEntityId: authorToDocClaim.entityId,
          rightEntityId: documentEntityId,
        },
        relationships: createDefaultAuthorizationRelationships({
          actorId: userAuthentication.actorId,
        }),
        properties: { value: {} },
      },
    );

    const authorClaims: ProposedEntity["claims"] = {
      isObjectOf: [],
      isSubjectOf: [authorToDocClaim.entityId],
    };

    const authorProposedEntity: ProposedEntity = {
      claims: authorClaims,
      entityTypeIds: [systemEntityTypes.person.entityTypeId],
      localEntityId: authorEntityId,
      properties: authorProperties,
      propertyMetadata: nameOnlyPropertyMetadata,
      provenance,
    };

    proposedEntities.push(authorProposedEntity);

    /**
     * Propose the link between the document and the author entity
     */
    const emptyClaims: ProposedEntity["claims"] = {
      isObjectOf: [],
      isSubjectOf: [],
    };
    proposedEntities.push({
      claims: emptyClaims,
      entityTypeIds: [systemLinkEntityTypes.authoredBy.linkEntityTypeId],
      localEntityId: entityIdFromComponents(
        webId,
        generateUuid() as EntityUuid,
      ),
      properties: {},
      propertyMetadata: { value: {} },
      provenance,
      sourceEntityId: {
        kind: "existing-entity",
        entityId: documentEntityId,
      },
      targetEntityId: { kind: "proposed-entity", localId: authorEntityId },
    });

    for (const affiliateName of affiliatedWith ?? []) {
      let institutionEntityId = institutionEntityIdByName[affiliateName];
      if (!institutionEntityId) {
        institutionEntityId = entityIdFromComponents(
          webId,
          generateUuid() as EntityUuid,
        );

        const properties: InstitutionProperties = {
          "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
            affiliateName,
        };

        /**
         * Create a claim about the person being affiliated with the institution.
         * This will be linked to the institution entity in the persist-entity step
         */
        const authorToInstitutionClaim = await createClaim({
          claimText: `${authorName} is affiliated with ${affiliateName}`,
          creatorActorId: aiAssistantAccountId,
          draft: createEntitiesAsDraft,
          objectText: affiliateName,
          ownedById: webId,
          propertyProvenance,
          provenance,
          subjectText: authorName,
          userActorId: userAuthentication.actorId,
        });
        authorProposedEntity.claims.isSubjectOf.push(
          authorToInstitutionClaim.entityId,
        );

        proposedEntities.push({
          claims: {
            isSubjectOf: [],
            isObjectOf: [authorToInstitutionClaim.entityId],
          },
          entityTypeIds: [systemEntityTypes.institution.entityTypeId],
          localEntityId: institutionEntityId,
          properties,
          propertyMetadata: nameOnlyPropertyMetadata,
          provenance,
        });

        institutionEntityIdByName[affiliateName] = institutionEntityId;
      }

      /**
       * Create the link between the person and the institution entity
       */
      proposedEntities.push({
        claims: emptyClaims,
        entityTypeIds: [systemLinkEntityTypes.affiliatedWith.linkEntityTypeId],
        localEntityId: entityIdFromComponents(
          webId,
          generateUuid() as EntityUuid,
        ),
        properties: {},
        propertyMetadata: { value: {} },
        provenance,
        sourceEntityId: { kind: "proposed-entity", localId: authorEntityId },
        targetEntityId: {
          kind: "proposed-entity",
          localId: institutionEntityId,
        },
      });
    }
  }

  const workerId = generateUuid();

  for (const proposedEntity of proposedEntities) {
    logProgress([
      {
        isUpdateToExistingProposal: false,
        parentInstanceId: null,
        proposedEntity,
        recordedAt: new Date().toISOString(),
        stepId: Context.current().info.activityId,
        toolCallId: "generateDocumentProposedEntities",
        type: "ProposedEntity",
        workerInstanceId: workerId,
        workerType: "Document analyzer",
      },
    ]);
  }

  return proposedEntities;
};
