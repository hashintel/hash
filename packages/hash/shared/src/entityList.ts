import { PageFieldsFragment } from "src/graphql/apiTypes.gen";

type ReturnedBlockType = PageFieldsFragment["properties"]["contents"][number];

export type EntityListType =
  | ReturnedBlockType
  | ReturnedBlockType["properties"]["entity"];

const mapEntityList = <T extends EntityListType>(
  entity: T
): [string, EntityListType][] => [
  [entity.metadataId, entity],
  ...("properties" in entity ? mapEntityList(entity.properties.entity) : []),
];

export const createEntityList = (contents: EntityListType[]) =>
  Object.fromEntries(contents.flatMap(mapEntityList));
