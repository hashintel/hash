import {
  KanbanBoardCardPropertyValue,
  KanbanBoardColumnPropertyValue,
  RootEntity,
} from "./types";

export type RootEntityKey = keyof RootEntity["properties"];
export type BoardColumnKey = keyof KanbanBoardColumnPropertyValue;
export type BoardCardKey = keyof KanbanBoardCardPropertyValue;
