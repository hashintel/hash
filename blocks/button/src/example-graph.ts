import { BlockEntity } from "./types/generated/block-entity";

export const blockEntity: BlockEntity = {
  metadata: {
    recordId: {
      entityId: "test-entity",
      editionId: new Date().toISOString(),
    },
    entityTypeId:
      "https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/2",
  },
  properties: {
    "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
      "World",
  },
} as const;

const exampleGraph = {
  blockEntityRecordId: blockEntity.metadata.recordId,
  entities: [blockEntity],
};

export default exampleGraph;
