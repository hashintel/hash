export type CardData = {
  id: string;
  columnId: string;
  content: string;
};

export type ColumnData = {
  id: string;
  title: string;
  cards: CardData[];
};

export type ColumnsState = Record<string, ColumnData>;

export const defaultColumns: ColumnsState = {
  "col-cats": {
    id: "col-cats",
    title: "Cats",
    cards: [
      { id: "cat-1", columnId: "col-cats", content: "Cat 1" },
      { id: "cat-2", columnId: "col-cats", content: "Cat 2" },
      { id: "cat-3", columnId: "col-cats", content: "Cat 3" },
    ],
  },
  "col-dogs": {
    id: "col-dogs",
    title: "Dogs",
    cards: [
      { id: "dog-1", columnId: "col-dogs", content: "Dog 1" },
      { id: "dog-2", columnId: "col-dogs", content: "Dog 2" },
      { id: "dog-3", columnId: "col-dogs", content: "Dog 3" },
    ],
  },
  "col-empty": { id: "col-empty", title: "Empty", cards: [] },
  "col-birds": {
    id: "col-birds",
    title: "Birds",
    cards: [
      { id: "bird-1", columnId: "col-birds", content: "Bird 1" },
      { id: "bird-2", columnId: "col-birds", content: "Bird 2" },
      { id: "bird-3", columnId: "col-birds", content: "Bird 3" },
    ],
  },
};
