import { PageFieldsFragment } from "src/graphql/apiTypes.gen";

type BlockType = PageFieldsFragment["properties"]["contents"][number];

export type EntityStoreType = BlockType | BlockType["properties"]["entity"];

export const isBlockEntity = (entity: EntityStoreType): entity is BlockType =>
  "properties" in entity && entity.__typename === "Block";

const mapToEntityStore = <T extends EntityStoreType>(
  entity: T
): [string, EntityStoreType][] => [
  [entity.metadataId, entity],
  ...(isBlockEntity(entity) ? mapToEntityStore(entity.properties.entity) : []),
];

export const createEntityStore = (contents: EntityStoreType[]) =>
  Object.fromEntries(contents.flatMap(mapToEntityStore));
