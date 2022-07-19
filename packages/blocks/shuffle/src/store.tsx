type Item = {
  id: number;
  pos: number;
  value: string;
};

type List = Item[];

export enum ActionType {
  ADD = "add",
  UPDATE_ITEM = "updateItem",
  REORDER = "reorder",
}

type AddAction = {
  type: ActionType.ADD;
};
type UpdateItemAction = {
  type: ActionType.UPDATE_ITEM;
  payload: { sourceId: number; value: string };
};
type ReorderAction = {
  type: ActionType.REORDER;
  payload: { sourceId: number; targetId: number };
};

type Actions = AddAction | UpdateItemAction | ReorderAction;

// const increaseAction: Action = {
//   type: ActionKind.Increase,
//   payload: 1,
// };

// const decreaseAction: Action = {
//   type: ActionKind.Decrease,
//   payload: 1,
// };

const createItem = (value: string): Partial<Item> => ({
  id: Date.now(),
  value,
});

export function reducer(list: List, action: Actions) {
  switch (action.type) {
    case ActionType.ADD:
      return [
        ...list,
        { id: Date.now(), value: `Item ${list.length + 1}`, pos: list.length },
      ];
    case ActionType.UPDATE_ITEM:
      return [...list].map((item) => {
        if (item.id === action.payload.sourceId) {
          return { ...item, value: action.payload.value };
        }

        return item;
      });
    case ActionType.REORDER:
      const newList = [...list];

      const sourcePos = newList.find(
        (item) => item.id === action.payload.sourceId,
      ).pos;
      const targetPos = newList.find(
        (item) => item.id === action.payload.targetId,
      ).pos;

      return [...list].map((item) => {
        if (item.id === action.payload.sourceId) {
          return { ...item, pos: targetPos };
        } else if (item.id === action.payload.targetId) {
          return { ...item, pos: sourcePos };
        }

        return item;
      });
    default:
      throw new Error();
  }
}
