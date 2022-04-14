import { ProsemirrorSchemaManager } from "@hashintel/hash-shared/ProsemirrorSchemaManager";

import { io, Socket } from "socket.io-client";
import { ProsemirrorNode, Schema } from "prosemirror-model";
import { EditorView } from "prosemirror-view";
import { EditorState, Plugin, Transaction } from "prosemirror-state";
import {
  DOCUMENT_UPDATED,
  InitialConnectionData,
  INITIAL_STATE,
  POSITION_UPDATED,
  SERVER_ERROR,
  ErrorEvent,
  InitialStateEvent,
  DocumentUpdatedEvent,
  PositionUpdatedEvent,
  ClientAction,
  VERSION_CONFLICT,
  UpdateDocumentCallback,
} from "@hashintel/hash-shared/collab";
import { createProseMirrorState } from "@hashintel/hash-shared/createProseMirrorState";
import { collab, receiveTransaction, sendableSteps } from "prosemirror-collab";
import { EntityStore } from "@hashintel/hash-shared/entityStore";
import {
  addEntityStoreAction,
  disableEntityStoreTransactionInterpretation,
  entityStorePluginState,
} from "@hashintel/hash-shared/entityStorePlugin";

import { Step } from "prosemirror-transform";

import { EditorConnectionInterface, State } from "./EditorConnectionInterface";

type StateActions =
  | {
      type: "loaded";
      doc: ProsemirrorNode<Schema>;
      store: EntityStore;
      version: number;
    }
  | {
      type: "restart";
    }
  | {
      type: "error";
      error: string;
    }
  | {
      type: "update";
      transaction: Transaction<Schema> | null;
      requestDone?: boolean;
      version: number;
    };

const repeat = <T>(val: T, count: number): T[] => {
  const result = [];
  for (let i = 0; i < count; i++) result.push(val);
  return result;
};

const emitClientAction = (
  socket: Socket,
  action: ClientAction,
  ack?: (data: any) => void,
) => {
  // eslint-disable-next-line no-console
  console.debug("Emitting update", action);
  socket.emit(action.type, action, ack);
};

export class EditorWsConnection extends EditorConnectionInterface {
  state = new State(null, "start", 0);
  backOff = 0;
  sentActions = new Set<string>();
  errored = false;
  socket: Socket;
  isRefetchingState = true;
  isSendingState = false;

  constructor(
    public url: string,
    public pmState: {
      schema: Schema;
      view: EditorView<Schema>;
      manager: ProsemirrorSchemaManager;
      additionalPlugins: Plugin<unknown, Schema>[];
    },
    public connectionData: InitialConnectionData,

    private onError: () => void,
  ) {
    super();

    this.socket = io(url, {
      query: connectionData,
      // Send cookie for auth
      withCredentials: true,
    });

    this.socket.connect();
    this.setupListeners();
  }

  close() {
    this.socket.close();
  }

  restart(): void {
    this.socket.disconnect();
    this.socket.connect();
  }

  updatePmViewState() {
    if (this.state.edit) {
      this.pmState.view.updateState(this.state.edit);
    }
  }

  dispatch = (action: StateActions) => {
    if (this.errored) {
      if (action.type === "update" && action.transaction) {
        this.pmState.view.updateState(
          this.pmState.view.state.apply(action.transaction),
        );
      }

      return;
    }

    let newEditState = null;
    let nextVersion = this.state.version;

    switch (action.type) {
      case "loaded": {
        const editorState = createProseMirrorState({
          accountId: this.connectionData.accountId,
          doc: action.doc,
          plugins: [
            ...this.pmState.additionalPlugins,
            // @todo set this version properly
            collab({ version: action.version }),
          ],
        });
        // @todo clear history?
        const { tr } = editorState;

        addEntityStoreAction(editorState, tr, {
          type: "store",
          payload: action.store,
        });

        const result = editorState.apply(tr);
        this.state = new State(result, "poll", action.version);
        break;
      }
      case "restart":
        this.state = new State(null, "start", 0);
        this.restart();
        break;
      case "error":
        this.errored = true;
        this.onError();
        this.state = new State(null, null, 0);
        this.close();
        break;
      case "update":
        if (!this.state.edit) {
          throw new Error("Cannot apply transaction without state to apply to");
        }
        if (action.transaction) {
          newEditState = this.state.edit.apply(action.transaction);
        } else {
          newEditState = this.state.edit;
        }
        nextVersion = action.version;
        break;
    }

    if (newEditState) {
      let sendable;
      if (
        // eslint-disable-next-line no-cond-assign
        (sendable = sendableSteps(newEditState)) &&
        sendable
      ) {
        // eslint-disable-next-line no-console
        console.debug("sending", { state: this.state, edit: newEditState });

        this.state = new State(newEditState, "send", nextVersion);
        this.send(newEditState, sendable);
      } else {
        this.state = new State(newEditState, this.state.mode, nextVersion);
      }
    }

    // Sync the editor with this.state.edit
    if (this.state.edit) {
      this.pmState.view.updateState(this.state.edit);
    } else {
      // @todo disable
    }
  };

  send(
    editState: EditorState<Schema<any, any>>,
    steps: NonNullable<ReturnType<typeof sendableSteps>>,
  ) {
    const actions = this.unsentActions(editState);

    const { steps: innerSteps, clientID: clientId } = steps;

    for (const action of actions) {
      this.sentActions.add(action.id);
    }

    const removeActions = () => {
      for (const action of actions) {
        this.sentActions.delete(action.id);
      }
    };

    emitClientAction(
      this.socket,
      {
        type: "updateDocument",
        version: this.state.version,
        steps: innerSteps.map((step) => step.toJSON()),
        clientId,
        // @todo do something smarter
        blockIds: Object.keys(editState.schema.nodes).filter((key) =>
          key.startsWith("http"),
        ),
        actions: actions.map((action) => action.action),
      },
      ({ status }: UpdateDocumentCallback) => {
        if (!this.state.edit) {
          throw new Error("Cannot receive steps without state");
        }
        if (status === "versionConflict") {
          // If saving did not go well, remove sent actions and try to sync version
          removeActions();
          this.onVersionConflict();
          return;
        }

        // If saving went well, apply update

        const tr = steps
          ? receiveTransaction(
              this.state.edit,
              innerSteps,
              repeat(clientId, innerSteps.length),
            )
          : this.state.edit.tr;

        this.dispatch({
          type: "update",
          transaction: tr,
          requestDone: true,
          version: this.state.version + innerSteps.length + actions.length,
        });
      },
    );
  }

  private unsentActions(editState: EditorState<Schema>) {
    return entityStorePluginState(editState).trackedActions.filter(
      (action) => !this.sentActions.has(action.id),
    );
  }

  dispatchTransaction(
    transaction: Transaction<Schema<any, any>>,
    version: number,
  ): void {
    this.dispatch({ type: "update", transaction, version });
  }

  onServerError = ({ error }: ErrorEvent) => {
    // eslint-disable-next-line no-console
    console.error("Collab error:", error);
    this.dispatch({ type: "error", error });
  };

  onInitialState = async (initialState: InitialStateEvent) => {
    // eslint-disable-next-line no-console
    console.debug("Initial state:", initialState);

    // When loading the inital document, we ensure that some invariants hold for the blocks and Prosemirror doc
    await this.pmState.manager
      .ensureBlocksDefined(initialState)
      .then(() => {
        // We ensure that the given document JSON is a proper Prosemirror node structure
        const doc = this.pmState.schema.nodeFromJSON(initialState.doc);

        return this.pmState.manager.ensureDocDefined(doc).then(() => ({ doc }));
      })
      .then(({ doc }) => {
        // If initial document passes checks, create prosemirror state with
        // the given initial state.
        const { version, store } = initialState;

        this.dispatch({
          type: "loaded",
          doc,
          store,
          version,
        });
      })
      .catch((error) => {
        // eslint-disable-next-line no-console -- TODO: consider using logger
        console.error(error);
        this.dispatch({ type: "error", error });
      });
  };

  onDocumentUpdated = (update: DocumentUpdatedEvent) => {
    // eslint-disable-next-line no-console
    console.debug("doc update", {
      currVer: this.state.version,
      newVer: update.version,
      update,
    });

    // If the update is older than or the same as our current version, ignore it.
    if (update.version < this.state.version) {
      return;
    }

    this.isRefetchingState = false;

    if (this.state.edit) {
      const tr = this.state.edit.tr;
      let shouldDispatch = false;

      if (update.store) {
        const unsentActions = this.unsentActions(this.state.edit);

        /**
         * @todo remove the need to do this – have it send us the relevant
         *       actions instead
         */
        addEntityStoreAction(this.state.edit, tr, {
          type: "store",
          payload: update.store,
        });
        for (const action of unsentActions) {
          addEntityStoreAction(this.state.edit, tr, action.action);
        }
        shouldDispatch = true;
      }

      if (update.actions?.length) {
        for (const action of update.actions) {
          addEntityStoreAction(this.state.edit, tr, {
            ...action,
            received: true,
          });
        }
        shouldDispatch = true;
      }

      if (shouldDispatch) {
        disableEntityStoreTransactionInterpretation(tr);
        this.dispatch({
          type: "update",
          transaction: tr,
          version: this.state.version,
        });
      }
    }

    let tr: Transaction<Schema> | null = null;

    if (update.steps?.length) {
      if (!this.state.edit) {
        throw new Error("Cannot receive transaction without state");
      }
      tr = receiveTransaction(
        this.state.edit,
        update.steps.map((json: any) =>
          Step.fromJSON(this.pmState.schema, json),
        ),
        update.clientIDs,
      );
      disableEntityStoreTransactionInterpretation(tr);
    }

    if (
      tr ||
      (typeof update.version !== "undefined" &&
        update.version !== this.state.version)
    ) {
      this.dispatch({
        type: "update",
        transaction: tr,
        requestDone: true,
        version: update.version ?? this.state.version,
      });
    }
  };

  onPositionUpdate = (positions: PositionUpdatedEvent) => {
    // eslint-disable-next-line no-console
    console.debug("pos update", positions);
  };

  onVersionConflict = () => {
    if (!this.isRefetchingState) {
      emitClientAction(this.socket, {
        type: "fetchVersion",
        currentVersion: this.state.version,
      });
      this.isRefetchingState = true;
    }
  };

  setupListeners() {
    this.socket.on(SERVER_ERROR, this.onServerError);
    this.socket.on(VERSION_CONFLICT, this.onVersionConflict);
    this.socket.on(INITIAL_STATE, this.onInitialState);
    this.socket.on(DOCUMENT_UPDATED, this.onDocumentUpdated);
    this.socket.on(POSITION_UPDATED, this.onPositionUpdate);
  }
}
