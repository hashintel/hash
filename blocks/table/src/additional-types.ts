import { RootEntity, TableLocalColumnPropertyValue } from "./types";

export type RootKey = keyof RootEntity["properties"];
export type ColumnKey = Readonly<keyof TableLocalColumnPropertyValue>;
