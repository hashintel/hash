// @todo delete this file
import { createContext } from "react";
import { Block, Entity } from "../../graphql/apiTypes.gen";

type EntityListType =
  | Pick<Entity, "metadataId">
  | Pick<Block, "metadataId" | "properties">;

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

export const EntityListContext = createContext<Record<string, EntityListType>>(
  {}
);
