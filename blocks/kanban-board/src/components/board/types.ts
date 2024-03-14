import type { UniqueIdentifier } from "@dnd-kit/core";

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

export type DataBeforeDrag =
  | {
      type: "columns";
      data: ColumnsState;
    }
  | { type: "columnOrder"; data: string[] }
  | null;

export type DeleteColumnCallback = (columnId: string) => void;
export type CreateCardCallback = (columnId: string, content: string) => void;
export type DeleteCardCallback = (columnId: string, cardId: string) => void;
export type UpdateColumnTitleCallback = (
  columnId: string,
  newTitle: string,
) => void;
export type UpdateCardContentCallback = (
  cardId: string,
  newContent: string,
) => void;
