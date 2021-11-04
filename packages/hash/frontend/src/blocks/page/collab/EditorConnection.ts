import { createProseMirrorState } from "@hashintel/hash-shared/createProseMirrorState";
import { EntityStore } from "@hashintel/hash-shared/entityStore";
import { addEntityStoreAction } from "@hashintel/hash-shared/entityStorePlugin";
import { ProsemirrorNode } from "@hashintel/hash-shared/node";
import { ProsemirrorSchemaManager } from "@hashintel/hash-shared/ProsemirrorSchemaManager";
import {
  collab,
  getVersion,
  receiveTransaction,
  sendableSteps,
} from "prosemirror-collab";
import { Schema } from "prosemirror-model";
import { EditorState, Plugin, Transaction } from "prosemirror-state";
import { Step } from "prosemirror-transform";
import { EditorView } from "prosemirror-view";
import { AbortingPromise, GET, POST } from "./http";
import { Reporter } from "./Reporter";
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
  ) {}
}

type EditorConnectionAction =
  | {
      type: "loaded";
      doc: ProsemirrorNode<Schema>;
      store: EntityStore;
      version: number;
      // @todo type this
      users: unknown;
    }
  | {
      type: "restart";
    }
  | {
      type: "poll";
    }
  | {
      type: "recover";
      error: StatusError;
    }
  | {
      type: "transaction";
      transaction: Transaction<Schema>;
      requestDone?: boolean;
    };

export class EditorConnection {
  state = new State(null, "start");
  backOff = 0;
  request: AbortingPromise<string> | null = null;

  constructor(
    public report: Reporter,
    public url: string,
    public schema: Schema,
    public view: EditorView<Schema>,
    public manager: ProsemirrorSchemaManager,
    public additionalPlugins: Plugin<unknown, Schema>[],
  ) {
    this.start();
  }

  // All state changes go through this
  dispatch = (action: EditorConnectionAction) => {
    let newEditState = null;
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

        addEntityStoreAction(tr, {
          type: "store",
          payload: action.store,
        });

        const result = editorState.apply(tr);
        this.state = new State(result, "poll");
        this.poll();
        break;
      }
      case "restart":
        this.state = new State(null, "start");
        this.start();
        break;
      case "poll":
        this.state = new State(this.state.edit, "poll");
        this.poll();
        break;
      case "recover":
        if (action.error.status && action.error.status < 500) {
          this.report.failure(action.error);
          this.state = new State(null, null);
        } else {
          this.state = new State(this.state.edit, "recover");
          this.recover(action.error);
        }
        break;
      case "transaction":
        if (!this.state.edit) {
          throw new Error("Cannot apply transaction without state to apply to");
        }
        newEditState = this.state.edit.apply(action.transaction);
        break;
    }

    if (newEditState) {
      let sendable;
      if (newEditState.doc.content.size > 40000) {
        if (this.state.comm !== "detached") {
          this.report.failure(new Error("Document too big. Detached."));
        }
        this.state = new State(newEditState, "detached");
      } else if (
        (this.state.comm === "poll" ||
          ("requestDone" in action && action.requestDone)) &&
        // eslint-disable-next-line no-cond-assign
        (sendable = this.sendable(newEditState))
      ) {
        this.closeRequest();
        this.state = new State(newEditState, "send");
        this.send(newEditState, sendable);
      } else if ("requestDone" in action && action.requestDone) {
        this.state = new State(newEditState, "poll");
        this.poll();
      } else {
        this.state = new State(newEditState, this.state.comm);
      }
    }

    // Sync the editor with this.state.edit
    if (this.state.edit) {
      this.view.updateState(this.state.edit);
    } else {
      // @todo disable
    }
  };

  dispatchTransaction = (transaction: Transaction<Schema>) => {
    this.dispatch({ type: "transaction", transaction });
  };

  // Load the document from the server and start up
  start() {
    this.run(GET(this.url))
      .then((stringifiedData) => {
        const data = JSON.parse(stringifiedData);

        return this.manager.ensureDocBlocksLoaded(data.doc).then(() => data);
      })
      .then((data) => {
        this.report.success();
        this.backOff = 0;
        this.dispatch({
          type: "loaded",
          doc: this.schema.nodeFromJSON(data.doc),
          store: data.store,
          version: data.version,
          users: data.users,
        });
      })
      .catch((err) => {
        console.error(err);
        this.report.failure(err);
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
    const query = `version=${getVersion(this.state.edit)}`;
    this.run(GET(`${this.url}/events?${query}`)).then(
      (stringifiedData) => {
        this.report.success();
        const data = JSON.parse(stringifiedData);
        this.backOff = 0;
        if (data.steps && (data.steps.length || data.comment.length)) {
          if (!this.state.edit) {
            throw new Error("Cannot receive transaction without state");
          }
          const tr = receiveTransaction(
            this.state.edit,
            data.steps.map((json: any) => Step.fromJSON(this.schema, json)),
            data.clientIDs,
          );
          this.dispatch({
            type: "transaction",
            transaction: tr,
            requestDone: true,
          });
        } else {
          this.poll();
        }
        // info.users.textContent = userString(data.users);
      },
      (err) => {
        if (err.status === 410 || badVersion(err)) {
          // Too far behind. Revert to server state
          this.report.failure(err);
          this.dispatch({ type: "restart" });
        } else if (err) {
          this.dispatch({ type: "recover", error: err });
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
    const json = JSON.stringify({
      version: getVersion(editState),
      steps: steps ? steps.steps.map((step) => step.toJSON()) : [],
      clientID: steps ? steps.clientID : 0,
      // @todo do something smarter
      blockIds: Object.keys(editState.schema.nodes).filter((key) =>
        key.startsWith("http"),
      ),
    });
    this.run(POST(`${this.url}/events`, json, "application/json")).then(
      () => {
        this.report.success();
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
        this.dispatch({
          type: "transaction",
          transaction: tr,
          requestDone: true,
        });
      },
      (err) => {
        if (err.status === 409) {
          // The client's document conflicts with the server's version.
          // Poll for changes and then try again.
          this.backOff = 0;
          this.dispatch({ type: "poll" });
        } else if (badVersion(err)) {
          this.report.failure(err);
          this.dispatch({ type: "restart" });
        } else {
          this.dispatch({ type: "recover", error: err });
        }
      },
    );
  }

  // Try to recover from an error
  recover(err: StatusError | Error) {
    const newBackOff = this.backOff ? Math.min(this.backOff * 2, 6e4) : 200;
    if (newBackOff > 1000 && this.backOff < 1000) this.report.delay(err);
    this.backOff = newBackOff;
    setTimeout(() => {
      if (this.state.comm === "recover") this.dispatch({ type: "poll" });
    }, this.backOff);
  }

  closeRequest() {
    if (this.request) {
      this.request.abort();
      this.request = null;
    }
  }

  run(request: AbortingPromise<string>) {
    this.request = request;
    return this.request!;
  }

  close() {
    this.closeRequest();
  }
}
