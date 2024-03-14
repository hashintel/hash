import { paragraphBlockComponentId } from "@local/hash-isomorphic-utils/blocks";
import {
  blockProtocolPropertyTypes,
  systemEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { BlockCollectionProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import type { OwnedById } from "@local/hash-subgraph";
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
              entityTypeId: systemEntityTypes[kind].entityTypeId,
              properties: {} satisfies BlockCollectionProperties,
            },
          }).then(({ data }) => {
            if (!data) {
              throw new Error(`Error creating ${kind} entity`);
            }

            return data;
          }),
          createEntity({
            data: {
              entityTypeId: systemEntityTypes.block.entityTypeId,
              properties: {
                [extractBaseUrl(
                  systemPropertyTypes.componentId.propertyTypeId,
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
              entityTypeId: systemEntityTypes.text.entityTypeId,
              properties: {
                [extractBaseUrl(
                  blockProtocolPropertyTypes.textualContent.propertyTypeId,
                )]: [],
              },
            },
          }).then(({ data }) => {
            if (!data) {
              throw new Error("Error creating text entity");
            }

            return data;
          }),
        ]);

      await Promise.all([
        createEntity({
          data: {
            entityTypeId:
              systemLinkEntityTypes.hasIndexedContent.linkEntityTypeId,
            linkData: {
              leftEntityId: blockCollectionEntity.metadata.recordId.entityId,
              rightEntityId: blockEntity.metadata.recordId.entityId,
            },
            properties: {
              [extractBaseUrl(
                systemPropertyTypes.fractionalIndex.propertyTypeId,
              )]: generateKeyBetween(null, null),
            },
          },
        }),
        createEntity({
          data: {
            entityTypeId: systemLinkEntityTypes.hasData.linkEntityTypeId,
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
