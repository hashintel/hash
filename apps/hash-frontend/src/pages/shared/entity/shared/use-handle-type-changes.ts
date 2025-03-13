import { mustHaveAtLeastOne } from "@blockprotocol/type-system";
import type { VersionedUrl } from "@blockprotocol/type-system-rs/pkg/type-system";
import {
  type Entity,
  getClosedMultiEntityTypeFromMap,
} from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";
import type { BaseUrl } from "@local/hash-graph-types/ontology";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import {
  getOutgoingLinksForEntity,
  getRoots,
} from "@local/hash-subgraph/stdlib";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import type { Dispatch, SetStateAction } from "react";
import { useCallback } from "react";

import { useGetClosedMultiEntityTypes } from "../../use-get-closed-multi-entity-type";
import type { EntityEditorProps } from "../entity-editor";
import { createDraftEntitySubgraph } from "./create-draft-entity-subgraph";

export const useHandleTypeChanges = ({
  entitySubgraph,
  setDraftEntitySubgraph,
  setDraftEntityTypesDetails,
  setDraftLinksToArchive,
}: {
  entitySubgraph: Subgraph<EntityRootType> | undefined;
  setDraftEntitySubgraph: Dispatch<
    SetStateAction<Subgraph<EntityRootType> | undefined>
  >;
  setDraftEntityTypesDetails: (
    args: Pick<
      EntityEditorProps,
      | "closedMultiEntityType"
      | "closedMultiEntityTypesDefinitions"
      | "closedMultiEntityTypesMap"
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
    }): Promise<Entity> => {
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

      const newTypeDetails = await getClosedMultiEntityTypes(entityTypeIds);

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
        linkedEntitiesClosedMultiEntityTypesMap:
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
