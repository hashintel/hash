import {
  Entity,
  PageFieldsFragment,
  Text,
  UnknownEntity,
} from "./graphql/apiTypes.gen";

export type AnyEntity = Entity | UnknownEntity | Text;

type ContentsEntity = PageFieldsFragment["properties"]["contents"][number];

export type BlockEntity = Omit<ContentsEntity, "properties"> & {
  properties: Omit<ContentsEntity["properties"], "entity"> & {
    entity: AnyEntity;
  };
};
