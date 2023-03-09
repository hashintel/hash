import { RootEntity, TableLocalColumnPropertyValue } from "./types.gen";

export type RootKey = keyof RootEntity["properties"];
export type ColumnKey = Readonly<keyof TableLocalColumnPropertyValue>;
