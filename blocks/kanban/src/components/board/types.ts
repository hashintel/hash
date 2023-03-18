import { UniqueIdentifier } from "@dnd-kit/core";

export type CardData = {
  id: string;
  content: string;
};

export type ColumnData = {
  id: string;
  title: string;
  cards: CardData[];
};

export type ColumnsState = Record<string, ColumnData>;

export type ActiveItem =
  | { type: "column"; id: UniqueIdentifier }
  | { type: "card"; id: UniqueIdentifier; data: CardData }
  | null;
