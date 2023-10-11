/* eslint-disable */
// @ts-nocheck
/**
 * Collab is currently disabled, which means this file does not represent the current way to edit pages.
 */
import { createProseMirrorState } from "@local/hash-isomorphic-utils/create-prose-mirror-state";
import {
  EntityStore,
  isBlockEntity,
} from "@local/hash-isomorphic-utils/entity-store";
import {
  addEntityStoreAction,
  disableEntityStoreTransactionInterpretation,
  entityStorePluginState,
  TrackedAction,
  EntityStorePluginAction,
} from "@local/hash-isomorphic-utils/entity-store-plugin";
import { ProsemirrorManager } from "@local/hash-isomorphic-utils/prosemirror-manager";
import { isString } from "lodash";
import { collab, receiveTransaction, sendableSteps } from "prosemirror-collab";
import { Node, Schema } from "prosemirror-model";
import { EditorState, Plugin, Transaction } from "prosemirror-state";
import { Step } from "prosemirror-transform";
import { EditorView } from "prosemirror-view";
import { AbortingPromise, GET, POST } from "./http";
import { StatusError } from "./status-error";

// @todo check this
const badVersion = (err: Error | StatusError) =>
  err instanceof StatusError &&
  err.status === 400 &&
  /invalid version/i.test(err.message);

const repeat = <T>(val: T, count: number): T[] => {
  const result = [];
  for (let i = 0; i < count; i++) {
    result.push(val);
  }
  return result;
};

class State {
  constructor(
    public edit: EditorState | null,
    public comm: string | null,
    public version: number,
  ) {}
}

type EditorConnectionAction =
  | {
      type: "loaded";
      doc: Node;
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
      transaction: Transaction | null;
      requestDone?: boolean;
      version: number;
    };

const NEW_INSTANCE_KEY = "collab-force-new-instance";

export class EditorConnection {
  state = new State(null, "start", 0);
  request: AbortingPromise<string> | null = null;
  sentActions = new Set<string>();
  errored = false;

  constructor(
    public url: string,
    public schema: Schema,
    public view: EditorView,
    public manager: ProsemirrorManager,
    public additionalPlugins: Plugin<unknown, Schema>[],
    public accountId: string,
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
      if (action.type === "update" && action.transaction) {
        this.view.updateState(this.view.state.apply(action.transaction));
      }

      return;
    }

    let newEditState = null;
    let nextVersion = this.state.version;

    switch (action.type) {
      case "loaded": {
        const editorState = createProseMirrorState({
          accountId: this.accountId,
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
        this.pollIfReady(action.version, editorState.apply(tr));
        break;
      }
      case "restart":
        this.state = new State(null, "start", 0);
        this.start();
        break;
      case "poll":
        this.pollIfReady(nextVersion);
        break;
      case "error":
        this.errored = true;
        this.onError();
        this.state = new State(null, null, 0);
        this.close();
        break;
      case "update": {
        let currentState: EditorState;

        if (!this.state.edit) {
          if (
            !action.transaction?.docChanged &&
            this.state.version === 0 &&
            this.state.comm === "start"
          ) {
            currentState = this.view.state;
            nextVersion = 0;
          } else {
            throw new Error(
              "Cannot apply transaction without state to apply to",
            );
          }
        } else {
          currentState = this.state.edit;
        }

        if (action.transaction) {
          newEditState = currentState.apply(action.transaction);
        } else {
          newEditState = currentState;
        }
        nextVersion = action.version;
        break;
      }
    }

    if (newEditState) {
      const requestDone = "requestDone" in action && action.requestDone;

      const sendableState = this.state.comm === "poll" || requestDone;
      const steps = sendableState ? sendableSteps(newEditState) : null;
      const actions = sendableState ? this.unsentActions(newEditState) : [];

      if (steps || actions?.length) {
        if (this.request) {
          if (this.state.comm === "send") {
            throw new Error("Cannot send while already in a sending state");
          }
          this.closeRequest();
        }
        this.state = new State(newEditState, "send", nextVersion);
        this.send(newEditState, { steps, actions });
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

  private pollIfReady(nextVersion: number, state = this.state.edit) {
    if (this.state.comm === "send" && this.request) {
      throw new Error("Cannot poll while sending");
    }
    this.state = new State(state, "poll", nextVersion);
    this.poll();
  }

  dispatchTransaction = (transaction: Transaction) => {
    this.dispatch({ type: "update", transaction, version: this.state.version });
  };

  // Load the document from the server and start up
  start() {
    let url = this.url;

    if (localStorage.getItem(NEW_INSTANCE_KEY) === "true") {
      url += "?forceNewInstance=true";
      localStorage.removeItem(NEW_INSTANCE_KEY);
    }

    this.closeRequest();

    this.run(GET(url))
      .then((responseText) => {
        const data = JSON.parse(responseText) as {
          doc: { [key: string]: any };
          store: EntityStore;
          version: number;
        };

        const componentIds = Object.values(data.store.saved)
          .filter(isBlockEntity)
          .map(
            (entity) =>
              "componentId" in entity.properties &&
              entity.properties?.componentId,
          )
          .filter(isString);

        return this.manager.ensureBlocksDefined(componentIds).then(() => data);
      })
      .then((data) => {
        const doc = this.schema.nodeFromJSON(data.doc);

        this.closeRequest();
        this.dispatch({
          type: "loaded",
          doc,
          store: data.store,
          version: data.version,
        });
      })
      .catch((err) => {
        this.closeRequest();

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
      async (stringifiedData) => {
        const data = JSON.parse(stringifiedData) as {
          actions: EntityStorePluginAction[];
          clientIDs: number[];
          steps: { [key: string]: any }[];
          store: EntityStore | null;
          version: number;
        };

        // pull out all componentIds and ensure they are defined
        const componentIds = data.actions?.reduce((acc, curr) => {
          if (
            curr.type === "updateEntityProperties" &&
            isString(curr.payload.properties.componentId) &&
            !acc.includes(curr.payload.properties.componentId)
          ) {
            return acc.concat(curr.payload.properties.componentId);
          }
          return acc;
        }, [] as string[]);

        await this.manager.ensureBlocksDefined(componentIds);

        if (this.state.edit) {
          const tr = this.state.edit.tr;

          // This also allows an empty object response to act
          // like a polling checkpoint
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

        let tr: Transaction | null = null;

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

        this.closeRequest();

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
        this.closeRequest();

        if (err.status === 410 || badVersion(err)) {
          // Too far behind. Revert to server state
          // @todo use logger

          console.warn(err);
          this.dispatch({ type: "restart" });
        } else if (err) {
          this.dispatch({ type: "error", error: err });
        }
      },
    );
  }

  // Send the given steps to the server
  send(
    editState: EditorState,
    {
      steps = null,
      actions = [],
    }: {
      steps?: ReturnType<typeof sendableSteps> | null;
      actions?: TrackedAction[];
    } = {},
  ) {
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
        this.closeRequest();
        this.dispatch({
          type: "update",
          transaction: tr,
          requestDone: true,
          version,
        });
      },
      (err) => {
        this.closeRequest();
        removeActions();
        if (err.status === 409) {
          // The client's document conflicts with the server's version.
          // Poll for changes and then try again.
          this.dispatch({ type: "poll" });
        } else if (badVersion(err)) {
          this.dispatch({ type: "restart" });
        } else {
          this.dispatch({ type: "error", error: err });
        }
      },
    );
  }

  private unsentActions(editState: EditorState) {
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
    if (this.request) {
      throw new Error("Existing request. Must close first");
    }
    this.request = request;
    return this.request;
  }

  close() {
    this.closeRequest();
  }
}
