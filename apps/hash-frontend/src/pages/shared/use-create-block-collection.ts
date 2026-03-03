import type { WebId } from "@blockprotocol/type-system";
import { paragraphBlockComponentId } from "@local/hash-isomorphic-utils/blocks-constants";
import {
  blockProtocolPropertyTypes,
  systemEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { BlockCollectionProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import { generateKeyBetween } from "fractional-indexing";
import { useCallback } from "react";

import { useBlockProtocolCreateEntity } from "../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-create-entity";

export const useCreateBlockCollection = (props: { webId: WebId }) => {
  const { webId } = props;
  const { createEntity } = useBlockProtocolCreateEntity(webId);

  const createBlockCollectionEntity = useCallback(
    async (params: { kind: "page" | "note" | "profileBio" }) => {
      const { kind } = params;

      const [blockCollectionEntity, blockEntity, textEntity] =
        await Promise.all([
          createEntity({
            data: {
              entityTypeIds: [systemEntityTypes[kind].entityTypeId],
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
              entityTypeIds: [systemEntityTypes.block.entityTypeId],
              properties: {
                [systemPropertyTypes.componentId.propertyTypeBaseUrl]:
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
              entityTypeIds: [systemEntityTypes.text.entityTypeId],
              properties: {
                [blockProtocolPropertyTypes.textualContent.propertyTypeBaseUrl]:
                  [],
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
            entityTypeIds: [
              systemLinkEntityTypes.hasIndexedContent.linkEntityTypeId,
            ],
            linkData: {
              leftEntityId: blockCollectionEntity.metadata.recordId.entityId,
              rightEntityId: blockEntity.metadata.recordId.entityId,
            },
            properties: {
              [systemPropertyTypes.fractionalIndex.propertyTypeBaseUrl]:
                generateKeyBetween(null, null),
            },
          },
        }),
        createEntity({
          data: {
            entityTypeIds: [systemLinkEntityTypes.hasData.linkEntityTypeId],
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
