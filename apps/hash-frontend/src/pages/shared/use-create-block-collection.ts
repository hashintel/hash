import { paragraphBlockComponentId } from "@local/hash-isomorphic-utils/blocks";
import {
  blockProtocolTypes,
  systemTypes,
} from "@local/hash-isomorphic-utils/ontology-types";
import { BlockCollectionProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import { OwnedById } from "@local/hash-subgraph";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { generateKeyBetween } from "fractional-indexing";
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
              entityTypeId: systemTypes.entityType[kind].entityTypeId,
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
              entityTypeId: systemTypes.entityType.block.entityTypeId,
              properties: {
                [extractBaseUrl(
                  systemTypes.propertyType.componentId.propertyTypeId,
                )]: paragraphBlockComponentId,
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
              entityTypeId: systemTypes.entityType.text.entityTypeId,
              properties: {
                [extractBaseUrl(
                  blockProtocolTypes.propertyType.textualContent.propertyTypeId,
                )]: [],
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
            entityTypeId:
              systemTypes.linkEntityType.hasIndexedContent.linkEntityTypeId,
            linkData: {
              leftEntityId: blockCollectionEntity.metadata.recordId.entityId,
              rightEntityId: blockEntity.metadata.recordId.entityId,
            },
            properties: {
              [extractBaseUrl(
                systemTypes.propertyType.fractionalIndex.propertyTypeId,
              )]: generateKeyBetween(null, null),
            },
          },
        }),
        createEntity({
          data: {
            entityTypeId: systemTypes.linkEntityType.hasData.linkEntityTypeId,
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
