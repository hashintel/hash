import { Reducer } from "react";
import { v4 as uuid } from "uuid";

export type Item = {
  id: string;
  value: string;
};

export type Items = Item[];

type Action<S, T = {}> = {
  type: S;
  payload?: T;
};

export enum ActionType {
  ADD = "add",
  UPDATE = "update",
  DELETE = "delete",
  REORDER = "reorder",
  SHUFFLE = "shuffle",
}

export type ShuffleReducerAction =
  | Action<ActionType.ADD>
  | Action<ActionType.UPDATE, { id: string; value: string }>
  | Action<ActionType.DELETE, { id: string }>
  | Action<
      ActionType.REORDER,
      { sourceIndex: number; destinationIndex: number }
    >
  | Action<ActionType.SHUFFLE>;

export const initialItems = [
  { id: uuid(), value: "Item 1" },
  { id: uuid(), value: "Item 2" },
];

export const shuffleReducer: Reducer<Items, ShuffleReducerAction> = (
  list,
  action,
) => {
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
};
