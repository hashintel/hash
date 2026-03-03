import type {
  ActorEntityUuid,
  EntityId,
  EntityUuid,
  PropertyObjectMetadata,
  PropertyProvenance,
  ProvidedEntityEditionProvenance,
  WebId,
} from "@blockprotocol/type-system";
import { entityIdFromComponents } from "@blockprotocol/type-system";
import { HashEntity, HashLinkEntity } from "@local/hash-graph-sdk/entity";
import type { ProposedEntity } from "@local/hash-isomorphic-utils/flows/types";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import {
  blockProtocolPropertyTypes,
  systemDataTypes,
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type {
  Claim as ClaimEntity,
  HasObject,
} from "@local/hash-isomorphic-utils/system-types/claim";
import type {
  InstitutionProperties,
  NamePropertyValueWithMetadata,
  PersonProperties,
  TextDataTypeMetadata,
} from "@local/hash-isomorphic-utils/system-types/shared";
import { Context } from "@temporalio/activity";

import { getFlowContext } from "../../shared/get-flow-context.js";
import { graphApiClient } from "../../shared/graph-api-client.js";
import { logProgress } from "../../shared/log-progress.js";
import type { DocumentData } from "./get-llm-analysis-of-doc.js";

const createClaim = async ({
  claimText,
  creatorActorId,
  draft,
  objectText,
  webId,
  propertyProvenance,
  provenance,
  subjectText,
}: {
  claimText: string;
  creatorActorId: ActorEntityUuid;
  draft: boolean;
  objectText: string;
  webId: WebId;
  propertyProvenance: PropertyProvenance;
  provenance: ProvidedEntityEditionProvenance;
  subjectText: string;
}) => {
  return await HashEntity.create<ClaimEntity>(
    graphApiClient,
    { actorId: creatorActorId },
    {
      draft,
      entityUuid: generateUuid() as EntityUuid,
      entityTypeIds: ["https://hash.ai/@h/types/entity-type/claim/v/1"],
      webId,
      provenance,
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
          "https://hash.ai/@h/types/property-type/subject/": {
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
              provenance: propertyProvenance,
            },
            value: subjectText,
          },

          "https://hash.ai/@h/types/property-type/object/": {
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
  aiAssistantAccountId: ActorEntityUuid;
  documentMetadata: Pick<DocumentData, "authors">;
  documentEntityId: EntityId;
  documentTitle: string;
  provenance: ProvidedEntityEditionProvenance;
  propertyProvenance: PropertyProvenance;
}): Promise<ProposedEntity[]> => {
  const {
    authors,
    /** @todo H-3619: Infer info on publisher and venue, and link to docs */
  } = documentMetadata;

  const { createEntitiesAsDraft, webId } = await getFlowContext();

  const textDataTypeMetadata: TextDataTypeMetadata = {
    dataTypeId:
      "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
    provenance: propertyProvenance,
  };

  const nameOnlyPropertyMetadata: PropertyObjectMetadata = {
    value: {
      [blockProtocolPropertyTypes.name.propertyTypeBaseUrl]: {
        metadata:
          textDataTypeMetadata satisfies NamePropertyValueWithMetadata["metadata"],
      },
    },
  };

  const proposedEntities: ProposedEntity[] = [];

  const institutionEntityIdByName: Record<string, EntityId> = {};

  for (const author of authors ?? []) {
    const { name: authorName, email, affiliatedWith } = author;

    const entityUuid = generateUuid() as EntityUuid;

    const authorPropertyMetadata = JSON.parse(
      JSON.stringify(nameOnlyPropertyMetadata),
    ) as typeof nameOnlyPropertyMetadata;

    const authorProperties: PersonProperties = {
      "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
        authorName,
    };

    if (email) {
      authorProperties["https://hash.ai/@h/types/property-type/email/"] = [
        email,
      ];
      authorPropertyMetadata.value[systemDataTypes.email.dataTypeBaseUrl] = {
        value: [
          {
            metadata: {
              dataTypeId: systemDataTypes.email.dataTypeId,
              provenance: propertyProvenance,
            },
          },
        ],
      };
    }

    const authorEntityId = entityIdFromComponents(webId, entityUuid);

    /**
     * Create a claim about the person having authored the document (person is the subject)
     *
     * The link to this claim will be created in persist-entity-action
     */
    const authorToDocClaim = await createClaim({
      claimText: `${authorName} authored ${documentTitle}`,
      creatorActorId: aiAssistantAccountId,
      draft: createEntitiesAsDraft,
      objectText: documentTitle,
      webId,
      propertyProvenance,
      provenance,
      subjectText: authorName,
    });

    /**
     * Create the link between the existing document entity and the claim (document is the object)
     */
    await HashLinkEntity.create<HasObject>(
      graphApiClient,
      { actorId: aiAssistantAccountId },
      {
        draft: createEntitiesAsDraft,
        entityTypeIds: [systemLinkEntityTypes.hasObject.linkEntityTypeId],
        webId,
        provenance,
        linkData: {
          leftEntityId: authorToDocClaim.entityId,
          rightEntityId: documentEntityId,
        },
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
      propertyMetadata: authorPropertyMetadata,
      provenance,
    };

    proposedEntities.push(authorProposedEntity);

    const emptyClaims: ProposedEntity["claims"] = {
      isObjectOf: [],
      isSubjectOf: [],
    };

    /**
     * Propose the authoredBy link between the document and the author entity
     */
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
      let institutionProposedEntity = institutionEntityId
        ? proposedEntities.find(
            (entity) => entity.localEntityId === institutionEntityId,
          )
        : null;

      institutionEntityId ??= entityIdFromComponents(
        webId,
        generateUuid() as EntityUuid,
      );

      if (!institutionProposedEntity) {
        const properties: InstitutionProperties = {
          "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
            affiliateName,
        };

        institutionProposedEntity = {
          claims: {
            isSubjectOf: [],
            isObjectOf: [],
          },
          entityTypeIds: [systemEntityTypes.institution.entityTypeId],
          localEntityId: institutionEntityId,
          properties,
          propertyMetadata: nameOnlyPropertyMetadata,
          provenance,
        };

        proposedEntities.push(institutionProposedEntity);

        institutionEntityIdByName[affiliateName] = institutionEntityId;
      }

      /**
       * Create a claim about the person being affiliated with the institution.
       */
      const authorToInstitutionClaim = await createClaim({
        claimText: `${authorName} is affiliated with ${affiliateName}`,
        creatorActorId: aiAssistantAccountId,
        draft: createEntitiesAsDraft,
        objectText: affiliateName,
        webId,
        propertyProvenance,
        provenance,
        subjectText: authorName,
      });

      authorProposedEntity.claims.isSubjectOf.push(
        authorToInstitutionClaim.entityId,
      );

      institutionProposedEntity.claims.isSubjectOf.push(
        authorToInstitutionClaim.entityId,
      );

      /**
       * Propose the link between the person and the institution entity
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
