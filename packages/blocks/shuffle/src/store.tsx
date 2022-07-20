import { v4 as uuid } from "uuid";

export type Item = {
  id: string;
  value: string;
};

export type ItemList = Item[];

export enum ActionType {
  ADD = "add",
  UPDATE = "update",
  DELETE = "delete",
  REORDER = "reorder",
  SHUFFLE = "shuffle",
}

type AddAction = {
  type: ActionType.ADD;
};

type UpdateItemAction = {
  type: ActionType.UPDATE;
  payload: { id: string; value: string };
};

type DeleteItemAction = {
  type: ActionType.DELETE;
  payload: { id: string };
};

type ReorderAction = {
  type: ActionType.REORDER;
  payload: { sourceIndex: number; destinationIndex: number };
};

type ShuffleAction = {
  type: ActionType.SHUFFLE;
};

type Actions =
  | AddAction
  | UpdateItemAction
  | DeleteItemAction
  | ReorderAction
  | ShuffleAction;

export const initialList = [
  { id: uuid(), value: "Item 1" },
  { id: uuid(), value: "Item 2" },
];

export function reducer(list: ItemList, action: Actions) {
  switch (action.type) {
    case ActionType.ADD:
      return [
        ...list,
        {
          id: uuid(),
          value: `Item ${list.length + 1}`,
        },
      ];

    case ActionType.UPDATE:
      return [...list].map((item) =>
        item.id === action.payload.id
          ? { ...item, value: action.payload.value }
          : item,
      );

    case ActionType.DELETE:
      const deleteList = [...list].filter(
        (item) => item.id !== action.payload.id,
      );
      return deleteList.length ? deleteList : [{ id: uuid(), value: "Item 1" }];

    case ActionType.REORDER:
      const { sourceIndex, destinationIndex } = action.payload;

      const reorderList = [...list];
      const [removed] = reorderList.splice(sourceIndex, 1);
      reorderList.splice(destinationIndex, 0, removed);

      return reorderList;

    case ActionType.SHUFFLE:
      return [...list]
        .map((value) => ({ value, sort: Math.random() }))
        .sort((a, b) => a.sort - b.sort)
        .map(({ value }) => value);

    default:
      throw new Error();
  }
}
