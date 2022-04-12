import { Schema } from "prosemirror-model";
import { EditorState, Transaction } from "prosemirror-state";

export type StateMode = "start" | "poll" | "send" | "update";

export class State {
  constructor(
    public edit: EditorState<Schema> | null,
    public mode: StateMode | null,
    public version: number,
  ) {}
}

export abstract class EditorConnectionInterface {
  abstract state: State;

  abstract dispatchTransaction(
    transaction: Transaction<Schema>,
    version: number,
  ): void;

  abstract close(): void;

  abstract restart(): void;
}
