import { Block, Entity } from "src/graphql/apiTypes.gen";

// @todo clean up this type
export type EntityListType =
  | Pick<Entity, "metadataId" | "id" | "accountId" | "entityTypeId">
  | Pick<
      Block,
      "metadataId" | "properties" | "id" | "accountId" | "entityTypeId"
    >;

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
