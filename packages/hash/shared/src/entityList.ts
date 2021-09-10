import { PageFieldsFragment } from "src/graphql/apiTypes.gen";

type ReturnedBlockType = PageFieldsFragment["properties"]["contents"][number];

export type EntityListType =
  | ReturnedBlockType
  | ReturnedBlockType["properties"]["entity"];

function mapEntityList<T extends EntityListType>(
  entity: T
): [string, EntityListType][] {
  return [
    [entity.metadataId, entity],
    ...("properties" in entity ? mapEntityList(entity.properties.entity) : []),
  ];
}

export function createEntityList(contents: EntityListType[]) {
  return Object.fromEntries(contents.flatMap(mapEntityList));
}
