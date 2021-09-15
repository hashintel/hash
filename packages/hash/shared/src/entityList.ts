import { PageFieldsFragment } from "src/graphql/apiTypes.gen";

type BlockType = PageFieldsFragment["properties"]["contents"][number];

export type EntityListType = BlockType | BlockType["properties"]["entity"];

export const isBlockEntity = (entity: EntityListType): entity is BlockType =>
  "properties" in entity && entity.__typename === "Block";

const mapEntityList = <T extends EntityListType>(
  entity: T
): [string, EntityListType][] => [
  [entity.metadataId, entity],
  ...(isBlockEntity(entity) ? mapEntityList(entity.properties.entity) : []),
];

export const createEntityList = (contents: EntityListType[]) =>
  Object.fromEntries(contents.flatMap(mapEntityList));
