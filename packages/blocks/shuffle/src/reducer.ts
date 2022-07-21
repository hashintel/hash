import { Reducer } from "react";
import produce from "immer";
import { v4 as uuid } from "uuid";

export type Item = {
  id: string;
  value: string;
};

export type Items = Item[];

type Action<S> = {
  type: S;
};

type ActionWithPayload<S, T> = Action<S> & {
  payload: T;
};

export enum ActionType {
  ADD = "add",
  UPDATE = "update",
  DELETE = "delete",
  REORDER = "reorder",
  SHUFFLE = "shuffle",
}

export type ShuffleReducerAction =
  | ActionWithPayload<ActionType.ADD, { index: number }>
  | ActionWithPayload<ActionType.UPDATE, { index: number; value: string }>
  | ActionWithPayload<ActionType.DELETE, { index: number }>
  | ActionWithPayload<
      ActionType.REORDER,
      { sourceIndex: number; destinationIndex: number }
    >
  | Action<ActionType.SHUFFLE>;

export const initialItems = [
  { id: uuid(), value: "Thing 1" },
  { id: uuid(), value: "Thing 2" },
];

export const shuffleReducer: Reducer<Items, ShuffleReducerAction> = (
  items,
  action,
) => {
  switch (action.type) {
    case ActionType.ADD:
      return produce(items, (draftItems) => {
        draftItems.splice(action.payload.index, 0, {
          id: uuid(),
          value: `Thing ${items.length + 1}`,
        });
      });

    case ActionType.UPDATE:
      return produce(items, (draftItems) => {
        const { index, value } = action.payload;

        if (draftItems[index]) {
          draftItems[index]!.value = value;
        }
      });

    case ActionType.DELETE:
      return produce(items, (draftItems) => {
        draftItems.splice(action.payload.index, 1);
        if (draftItems.length === 0) {
          draftItems.push({ id: uuid(), value: "Thing 1" });
        }
      });

    case ActionType.REORDER:
      return produce(items, (draftItems) => {
        const { sourceIndex, destinationIndex } = action.payload;
        const [removed] = draftItems.splice(sourceIndex, 1);
        if (removed) {
          draftItems.splice(destinationIndex, 0, removed);
        }
      });

    case ActionType.SHUFFLE:
      return produce(items, (draftItems) => {
        return draftItems
          .map((value) => ({ value, sort: Math.random() }))
          .sort((a, b) => a.sort - b.sort)
          .map(({ value }) => value);
      });

    default:
      throw new Error();
  }
};
