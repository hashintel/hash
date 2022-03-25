import { createProseMirrorState } from "@hashintel/hash-shared/createProseMirrorState";
import { EntityStore } from "@hashintel/hash-shared/entityStore";
import {
  addEntityStoreAction,
  disableEntityStoreTransactionInterpretation,
  entityStorePluginState,
} from "@hashintel/hash-shared/entityStorePlugin";
import { ProsemirrorSchemaManager } from "@hashintel/hash-shared/ProsemirrorSchemaManager";
import { collab, receiveTransaction, sendableSteps } from "prosemirror-collab";
import { ProsemirrorNode, Schema } from "prosemirror-model";
import { EditorState, Plugin, Transaction } from "prosemirror-state";
import { Step } from "prosemirror-transform";
import { EditorView } from "prosemirror-view";
import { AbortingPromise, GET, POST } from "./http";
import { StatusError } from "./StatusError";

// @todo check this
const badVersion = (err: Error | StatusError) =>
  err instanceof StatusError &&
  err.status === 400 &&
  /invalid version/i.test(err.message);

const repeat = <T>(val: T, count: number): T[] => {
  const result = [];
  for (let i = 0; i < count; i++) result.push(val);
  return result;
};

class State {
  constructor(
    public edit: EditorState<Schema> | null,
    public comm: string | null,
    public version: number,
  ) {}
}

type EditorConnectionAction =
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
      type: "poll";
    }
  | {
      type: "error";
      error: StatusError;
    }
  | {
      type: "update";
      transaction: Transaction<Schema> | null;
      requestDone?: boolean;
      version: number;
    };

const NEW_INSTANCE_KEY = "collab-force-new-instance";

export class EditorConnection {
  state = new State(null, "start", 0);
  backOff = 0;
  request: AbortingPromise<string> | null = null;
  sentActions = new Set<string>();
  errored = false;

  constructor(
    public url: string,
    public schema: Schema,
    public view: EditorView<Schema>,
    public manager: ProsemirrorSchemaManager,
    public additionalPlugins: Plugin<unknown, Schema>[],
    private onError: () => void,
  ) {
    this.start();
  }

  restart() {
    localStorage.setItem(NEW_INSTANCE_KEY, "true");
    window.location.reload();
  }

  // All state changes go through this
  dispatch = (action: EditorConnectionAction) => {
    if (this.errored) {
      if (action.type === "update") {
        this.view.updateState(this.view.state.apply(action.transaction));
      }

      return;
    }

    let newEditState = null;
    let nextVersion = this.state.version;

    switch (action.type) {
      case "loaded": {
        const editorState = createProseMirrorState({
          doc: action.doc,
          plugins: [
            ...this.additionalPlugins,
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
        this.poll();
        break;
      }
      case "restart":
        this.state = new State(null, "start", 0);
        this.start();
        break;
      case "poll":
        this.state = new State(this.state.edit, "poll", nextVersion);
        this.poll();
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
      const requestDone = "requestDone" in action && action.requestDone;

      let sendable;
      if (
        (this.state.comm === "poll" || requestDone) &&
        // eslint-disable-next-line no-cond-assign
        (sendable = this.sendable(newEditState))
      ) {
        this.closeRequest();
        this.state = new State(newEditState, "send", nextVersion);
        this.send(newEditState, sendable);
      } else if (requestDone) {
        this.state = new State(newEditState, "poll", nextVersion);
        this.poll();
      } else {
        this.state = new State(newEditState, this.state.comm, nextVersion);
      }
    }

    // Sync the editor with this.state.edit
    if (this.state.edit) {
      this.view.updateState(this.state.edit);
    } else {
      // @todo disable
    }
  };

  dispatchTransaction = (transaction: Transaction<Schema>, version: number) => {
    this.dispatch({ type: "update", transaction, version });
  };

  // Load the document from the server and start up
  start() {
    let url = this.url;

    if (localStorage.getItem(NEW_INSTANCE_KEY) === "true") {
      url += "?forceNewInstance=true";
      localStorage.removeItem(NEW_INSTANCE_KEY);
    }

    this.run(GET(url))
      .then((responseText) => {
        // @todo type this
        const data = JSON.parse(responseText);

        return this.manager.ensureBlocksDefined(data).then(() => data);
      })
      .then((data) => {
        const doc = this.schema.nodeFromJSON(data.doc);

        return this.manager.ensureDocDefined(doc).then(() => ({ doc, data }));
      })
      .then(({ data, doc }) => {
        this.backOff = 0;
        this.dispatch({
          type: "loaded",
          doc,
          store: data.store,
          version: data.version,
        });
      })
      .catch((err) => {
        // eslint-disable-next-line no-console -- TODO: consider using logger
        console.error(err);
        this.dispatch({ type: "error", error: err });
      });
  }

  // Send a request for events that have happened since the version
  // of the document that the client knows about. This request waits
  // for a new version of the document to be created if the client
  // is already up-to-date.
  poll() {
    if (!this.state.edit) {
      throw new Error("Cannot poll without state");
    }
    const query = `version=${this.state.version}`;
    this.run(GET(`${this.url}/events?${query}`)).then(
      (stringifiedData) => {
        // @todo type this
        const data = JSON.parse(stringifiedData);
        this.backOff = 0;

        if (this.state.edit) {
          const tr = this.state.edit.tr;
          let shouldDispatch = false;

          if (data.store) {
            const unsentActions = this.unsentActions(this.state.edit);

            /**
             * @todo remove the need to do this – have it send us the relevant
             *       actions instead
             */
            addEntityStoreAction(this.state.edit, tr, {
              type: "store",
              payload: data.store,
            });
            for (const action of unsentActions) {
              addEntityStoreAction(this.state.edit, tr, action.action);
            }
            shouldDispatch = true;
          }

          if (data.actions?.length) {
            for (const action of data.actions) {
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

        if (data.steps?.length) {
          if (!this.state.edit) {
            throw new Error("Cannot receive transaction without state");
          }
          tr = receiveTransaction(
            this.state.edit,
            data.steps.map((json: any) => Step.fromJSON(this.schema, json)),
            data.clientIDs,
          );
          disableEntityStoreTransactionInterpretation(tr);
        }

        if (
          tr ||
          (typeof data.version !== "undefined" &&
            data.version !== this.state.version)
        ) {
          this.dispatch({
            type: "update",
            transaction: tr,
            requestDone: true,
            version: data.version ?? this.state.version,
          });
        } else {
          this.poll();
        }
      },
      (err) => {
        if (err.status === 410 || badVersion(err)) {
          // Too far behind. Revert to server state
          // @todo use logger
          // eslint-disable-next-line no-console
          console.warn(err);
          this.dispatch({ type: "restart" });
        } else if (err) {
          this.dispatch({ type: "error", error: err });
        }
      },
    );
  }

  sendable(editState: EditorState<Schema>) {
    const steps = sendableSteps(editState);
    if (steps) return { steps };
  }

  // Send the given steps to the server
  send(
    editState: EditorState<Schema>,
    { steps }: { steps?: ReturnType<typeof sendableSteps> } = {},
  ) {
    const actions = this.unsentActions(editState);

    for (const action of actions) {
      this.sentActions.add(action.id);
    }

    const json = JSON.stringify({
      version: this.state.version,
      steps: steps ? steps.steps.map((step) => step.toJSON()) : [],
      clientID: steps ? steps.clientID : 0,
      // @todo do something smarter
      blockIds: Object.keys(editState.schema.nodes).filter((key) =>
        key.startsWith("http"),
      ),
      actions: actions.map((action) => action.action),
    });
    const removeActions = () => {
      for (const action of actions) {
        this.sentActions.delete(action.id);
      }
    };
    this.run(
      POST(`${this.url}/events`, json, "application/json", removeActions),
    ).then(
      (data) => {
        this.backOff = 0;
        if (!this.state.edit) {
          throw new Error("Cannot receive steps without state");
        }
        const tr = steps
          ? receiveTransaction(
              this.state.edit,
              steps.steps,
              repeat(steps.clientID, steps.steps.length),
            )
          : this.state.edit.tr;
        const version = JSON.parse(data).version;
        this.dispatch({
          type: "update",
          transaction: tr,
          requestDone: true,
          version,
        });
      },
      (err) => {
        removeActions();
        if (err.status === 409) {
          // The client's document conflicts with the server's version.
          // Poll for changes and then try again.
          this.backOff = 0;
          this.dispatch({ type: "poll" });
        } else if (badVersion(err)) {
          this.dispatch({ type: "restart" });
        } else {
          this.dispatch({ type: "error", error: err });
        }
      },
    );
  }

  private unsentActions(editState: EditorState<Schema>) {
    return entityStorePluginState(editState).trackedActions.filter(
      (action) => !this.sentActions.has(action.id),
    );
  }

  closeRequest() {
    if (this.request) {
      this.request.abort();
      this.request = null;
    }
  }

  run(request: AbortingPromise<string>) {
    this.request = request;
    return this.request;
  }

  close() {
    this.closeRequest();
  }
}
