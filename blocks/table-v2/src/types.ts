import { LocalColumnsPropertyValue, RootEntity } from "./types.gen";

export type RootPropertyKey = keyof RootEntity["properties"];
export type LocalColumnPropertyKey = Readonly<keyof LocalColumnsPropertyValue>;
