import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import {
  getOutgoingLinksForEntity,
  getRoots,
} from "@blockprotocol/graph/stdlib";
import type {
  BaseUrl,
  EntityId,
  VersionedUrl,
} from "@blockprotocol/type-system";
import { extractBaseUrl, mustHaveAtLeastOne } from "@blockprotocol/type-system";
import {
  getClosedMultiEntityTypeFromMap,
  type HashEntity,
} from "@local/hash-graph-sdk/entity";
import type { Dispatch, SetStateAction } from "react";
import { useCallback } from "react";

import { useGetClosedMultiEntityTypes } from "../../use-get-closed-multi-entity-type";
import type { EntityEditorProps } from "../entity-editor";
import { getEntityMultiTypeDependencies } from "../get-entity-multi-type-dependencies";
import { createDraftEntitySubgraph } from "./create-draft-entity-subgraph";

export const useHandleTypeChanges = ({
  entitySubgraph,
  setDraftEntitySubgraph,
  setDraftEntityTypesDetails,
  setDraftLinksToArchive,
}: {
  entitySubgraph: Subgraph<EntityRootType<HashEntity>> | undefined;
  setDraftEntitySubgraph: Dispatch<
    SetStateAction<Subgraph<EntityRootType<HashEntity>> | undefined>
  >;
  setDraftEntityTypesDetails: (
    args: Pick<
      EntityEditorProps,
      | "closedMultiEntityType"
      | "closedMultiEntityTypesDefinitions"
      | "linkAndDestinationEntitiesClosedMultiEntityTypesMap"
    >,
  ) => void;
  setDraftLinksToArchive: Dispatch<SetStateAction<EntityId[]>>;
}) => {
  const { getClosedMultiEntityTypes } = useGetClosedMultiEntityTypes();

  return useCallback(
    async (change: {
      entityTypeIds: [VersionedUrl, ...VersionedUrl[]];
      removedPropertiesBaseUrls: BaseUrl[];
      removedLinkTypesBaseUrls: BaseUrl[];
    }): Promise<HashEntity> => {
      const {
        entityTypeIds,
        removedPropertiesBaseUrls,
        removedLinkTypesBaseUrls,
      } = change;

      if (!entitySubgraph) {
        throw new Error("Entity subgraph not found");
      }

      const entity = getRoots(entitySubgraph)[0];

      if (!entity) {
        throw new Error("Entity not found in subgraph");
      }

      const requiredEntityTypeIds = getEntityMultiTypeDependencies({
        entityId: entity.entityId,
        entityTypeIds,
        entitySubgraph,
      });

      const newTypeDetails = await getClosedMultiEntityTypes(
        requiredEntityTypeIds,
      );

      const outgoingLinks = getOutgoingLinksForEntity(
        entitySubgraph,
        entity.entityId,
      );

      const linkEntityIdsToArchive: EntityId[] = [];

      for (const link of outgoingLinks) {
        if (
          link.metadata.entityTypeIds.every((linkTypeId) =>
            removedLinkTypesBaseUrls.includes(extractBaseUrl(linkTypeId)),
          )
        ) {
          linkEntityIdsToArchive.push(link.entityId);
        }
      }

      const closedMultiEntityType = getClosedMultiEntityTypeFromMap(
        newTypeDetails.closedMultiEntityTypes,
        mustHaveAtLeastOne(entityTypeIds),
      );

      setDraftEntityTypesDetails({
        linkAndDestinationEntitiesClosedMultiEntityTypesMap:
          newTypeDetails.closedMultiEntityTypes,
        closedMultiEntityType,
        closedMultiEntityTypesDefinitions:
          newTypeDetails.closedMultiEntityTypesDefinitions,
      });

      setDraftEntitySubgraph((prev) =>
        createDraftEntitySubgraph({
          currentSubgraph: prev,
          entity,
          entityTypeIds,
          omitProperties: removedPropertiesBaseUrls,
        }),
      );

      if (linkEntityIdsToArchive.length > 0) {
        setDraftLinksToArchive((prev) => [...prev, ...linkEntityIdsToArchive]);
      }

      const newEntity = getRoots(entitySubgraph)[0];

      if (!newEntity) {
        throw new Error("Entity not found in subgraph");
      }

      return newEntity;
    },
    [
      entitySubgraph,
      getClosedMultiEntityTypes,
      setDraftEntityTypesDetails,
      setDraftEntitySubgraph,
      setDraftLinksToArchive,
    ],
  );
};
