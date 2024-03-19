import type {
  BlockEntity,
  TableLocalColumnPropertyValue,
} from "./types/generated/block-entity";

export type RootKey = keyof BlockEntity["properties"];
export type ColumnKey = Readonly<keyof TableLocalColumnPropertyValue>;
