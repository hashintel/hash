import {
  KbnBoardCardsPropertyValue,
  KbnBoardColumnsPropertyValue,
  RootEntity,
} from "./types";

export type RootEntityKey = keyof RootEntity["properties"];
export type BoardColumnKey = keyof KbnBoardColumnsPropertyValue[0];
export type BoardCardKey = keyof KbnBoardCardsPropertyValue[0];
