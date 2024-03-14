import type {
  BlockEntity,
  KanbanBoardCardPropertyValue,
  KanbanBoardColumnPropertyValue,
} from "./types/generated/block-entity";

export type BlockEntityKey = keyof BlockEntity["properties"];
export type BoardColumnKey = keyof KanbanBoardColumnPropertyValue;
export type BoardCardKey = keyof KanbanBoardCardPropertyValue;
