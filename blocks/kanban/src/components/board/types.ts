export type CardData = {
  id: string;
  content: string;
};

export type ColumnData = {
  id: string;
  title: string;
  cards: CardData[];
};
