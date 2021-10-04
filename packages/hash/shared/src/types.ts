import {
  Entity,
  PageFieldsFragment,
  Text,
  UnknownEntity,
} from "./graphql/apiTypes.gen";

/**
 * Necessary to perform an omit across a union of types without collapsing
 * the union
 */
type DistributiveOmit<T, K extends keyof any> = T extends any
  ? Omit<T, K>
  : never;

// @todo can we do this at the type generation level
export type MappedEntity = DistributiveOmit<
  Entity | UnknownEntity | Text,
  "metadataId"
>;

type ContentsEntity = PageFieldsFragment["properties"]["contents"][number];

// @todo make this not necessary
export type BlockEntity = Omit<ContentsEntity, "properties"> & {
  properties: Omit<ContentsEntity["properties"], "entity"> & {
    entity: MappedEntity;
  };
};
