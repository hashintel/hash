import { paragraphBlockComponentId } from "@local/hash-isomorphic-utils/blocks";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import { BlockCollectionProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import { OwnedById } from "@local/hash-subgraph";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { useCallback } from "react";

import { useBlockProtocolCreateEntity } from "../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-create-entity";

export const useCreateBlockCollection = (props: { ownedById: OwnedById }) => {
  const { ownedById } = props;
  const { createEntity } = useBlockProtocolCreateEntity(ownedById);

  const createBlockCollectionEntity = useCallback(
    async (params: { kind: "page" | "quickNote" | "profileBio" }) => {
      const { kind } = params;

      const [blockCollectionEntity, blockEntity, textEntity] =
        await Promise.all([
          createEntity({
            data: {
              entityTypeId: types.entityType[kind].entityTypeId,
              properties: {} satisfies BlockCollectionProperties,
            },
          }).then(({ data }) => {
            if (!data) {
              throw new Error("Error creating profile bio entity");
            }

            return data;
          }),
          createEntity({
            data: {
              entityTypeId: types.entityType.block.entityTypeId,
              properties: {
                [extractBaseUrl(types.propertyType.componentId.propertyTypeId)]:
                  paragraphBlockComponentId,
              },
            },
          }).then(({ data }) => {
            if (!data) {
              throw new Error("Error creating block entity");
            }

            return data;
          }),
          createEntity({
            data: {
              entityTypeId: types.entityType.text.entityTypeId,
              properties: {
                [extractBaseUrl(types.propertyType.tokens.propertyTypeId)]: [],
              },
            },
          }).then(({ data }) => {
            if (!data) {
              throw new Error("Error creating block entity");
            }

            return data;
          }),
        ]);

      await Promise.all([
        createEntity({
          data: {
            entityTypeId: types.linkEntityType.contains.linkEntityTypeId,
            linkData: {
              leftEntityId: blockCollectionEntity.metadata.recordId.entityId,
              rightEntityId: blockEntity.metadata.recordId.entityId,
            },
            properties: {
              [extractBaseUrl(
                types.propertyType.numericIndex.propertyTypeId,
              )]: 0,
            },
          },
        }),
        createEntity({
          data: {
            entityTypeId: types.linkEntityType.blockData.linkEntityTypeId,
            linkData: {
              leftEntityId: blockEntity.metadata.recordId.entityId,
              rightEntityId: textEntity.metadata.recordId.entityId,
            },
            properties: {},
          },
        }),
      ]);

      return blockCollectionEntity;
    },
    [createEntity],
  );

  return { createBlockCollectionEntity };
};
