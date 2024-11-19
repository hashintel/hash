import type { PropertyProvenance } from "@local/hash-graph-client";
import type { EnforcedEntityEditionProvenance } from "@local/hash-graph-sdk/entity";
import type {
  EntityId,
  EntityUuid,
  PropertyMetadataObject,
} from "@local/hash-graph-types/entity";
import type { OwnedById } from "@local/hash-graph-types/web";
import type { ProposedEntity } from "@local/hash-isomorphic-utils/flows/types";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import {
  blockProtocolPropertyTypes,
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type {
  InstitutionProperties,
  PersonProperties,
  TextDataTypeMetadata,
} from "@local/hash-isomorphic-utils/system-types/shared";
import { entityIdFromComponents } from "@local/hash-subgraph";
import { Context } from "@temporalio/activity";

import { logProgress } from "../../shared/log-progress.js";
import type { DocumentMetadata } from "./get-llm-analysis-of-doc.js";

export const generateDocumentProposedEntities = ({
  documentMetadata,
  documentEntityId,
  provenance,
  propertyProvenance,
  webId,
}: {
  documentMetadata: Pick<
    DocumentMetadata,
    "authors" | "publicationVenue" | "publishedBy"
  >;
  documentEntityId: EntityId;
  provenance: EnforcedEntityEditionProvenance;
  propertyProvenance: PropertyProvenance;
  webId: OwnedById;
}): ProposedEntity[] => {
  const {
    authors,
    publicationVenue: _publicationVenue,
    publishedBy: _publishedBy,
  } = documentMetadata;

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
    const { name, affiliatedWith } = author;

    const entityUuid = generateUuid() as EntityUuid;

    const authorProperties: PersonProperties = {
      "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
        name,
    };

    /**
     * @todo generate claims for affiliations and authorship
     */
    const emptyClaims: ProposedEntity["claims"] = {
      isObjectOf: [],
      isSubjectOf: [],
    };

    const authorEntityId = entityIdFromComponents(webId, entityUuid);

    proposedEntities.push({
      claims: emptyClaims,
      entityTypeIds: [systemEntityTypes.person.entityTypeId],
      localEntityId: authorEntityId,
      properties: authorProperties,
      propertyMetadata: nameOnlyPropertyMetadata,
      provenance,
    });

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
         * @todo generate claims for affiliation
         */

        proposedEntities.push({
          claims: emptyClaims,
          entityTypeIds: [systemEntityTypes.institution.entityTypeId],
          localEntityId: institutionEntityId,
          properties,
          propertyMetadata: nameOnlyPropertyMetadata,
          provenance,
        });

        institutionEntityIdByName[affiliateName] = institutionEntityId;
      }

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
