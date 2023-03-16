export type CardData = {
  id: string;
  content: string;
};

export type ColumnData = {
  id: string;
  title: string;
  cards: CardData[];
};

export const defaultColumns: ColumnData[] = [
  {
    id: "1",
    title: "Column with a title",
    cards: [
      { id: "1", content: "Card with some content" },
      {
        id: "2",
        content: "Card with an slightly longer content goes here :)",
      },
      { id: "3", content: "Another card" },
    ],
  },
  {
    id: "2",
    title: "Column with a title",
    cards: [
      { id: "4", content: "Card with some content" },
      {
        id: "5",
        content: "Card with an slightly longer content goes here :)",
      },
      { id: "6", content: "Another card" },
    ],
  },
  {
    id: "3",
    title: "Column with a title",
    cards: [
      { id: "7", content: "Card with some content" },
      {
        id: "8",
        content: "Card with an slightly longer content goes here :)",
      },
      { id: "9", content: "Another card" },
    ],
  },
];
