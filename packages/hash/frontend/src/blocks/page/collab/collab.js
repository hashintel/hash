import { Step } from "prosemirror-transform";
import {
  collab,
  getVersion,
  receiveTransaction,
  sendableSteps,
} from "prosemirror-collab";
import {
  createProseMirrorState,
  ensureDocBlocksLoaded,
} from "@hashintel/hash-shared/prosemirror";

import { GET, POST } from "./http";
import { createNodeViewFactory, defineNodeView } from "../tsUtils";

const badVersion = (err) => err.status === 400 && /invalid version/i.test(err);

const repeat = (val, count) => {
  const result = [];
  for (let i = 0; i < count; i++) result.push(val);
  return result;
};

class State {
  constructor(edit, comm) {
    this.edit = edit;
    this.comm = comm;
  }
}

export class EditorConnection {
  constructor(report, url, schema, view, replacePortal, additionalPlugins) {
    this.report = report;
    this.url = url;
    this.state = new State(null, "start");
    this.request = null;
    this.backOff = 0;
    this.view = view;
    this.dispatch = this.dispatch.bind(this);
    this.start();
    this.schema = schema;
    this.replacePortal = replacePortal;
    // @todo rename this
    this.additionalPlugins = additionalPlugins;
  }

  // All state changes go through this
  dispatch(action) {
    let newEditState = null;
    switch (action.type) {
      case "loaded":
        this.state = new State(
          createProseMirrorState({
            doc: action.doc,
            plugins: [
              ...this.additionalPlugins,
              // @todo set this version properly
              collab({ version: action.version }),
            ],
          }),
          "poll"
        );
        this.poll();
        break;
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
        newEditState = this.state.edit.apply(action.transaction);
        break;
    }

    if (newEditState) {
      let sendable;
      if (newEditState.doc.content.size > 40000) {
        if (this.state.comm !== "detached") {
          this.report.failure("Document too big. Detached.");
        }
        this.state = new State(newEditState, "detached");
      } else if (
        (this.state.comm === "poll" || action.requestDone) &&
        // eslint-disable-next-line no-cond-assign
        (sendable = this.sendable(newEditState))
      ) {
        this.closeRequest();
        this.state = new State(newEditState, "send");
        this.send(newEditState, sendable);
      } else if (action.requestDone) {
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
  }

  dispatchTransaction = (transaction) => {
    this.dispatch({ type: "transaction", transaction });
  };

  // Load the document from the server and start up
  start() {
    this.run(GET(this.url))
      .then((stringifiedData) => {
        const data = JSON.parse(stringifiedData);
        return ensureDocBlocksLoaded(this.schema, data.doc, {
          view: this.view,
          replacePortal: this.replacePortal,
          createNodeView: createNodeViewFactory(this.replacePortal),
          defineNodeView: defineNodeView(
            createNodeViewFactory(this.replacePortal),
            this.view
          ),
        }).then(() => data);
      })
      .then((data) => {
        this.report.success();
        this.backOff = 0;
        this.dispatch({
          type: "loaded",
          doc: this.schema.nodeFromJSON(data.doc),
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
    const query = `version=${getVersion(this.state.edit)}`;
    this.run(GET(`${this.url}/events?${query}`)).then(
      (stringifiedData) => {
        this.report.success();
        const data = JSON.parse(stringifiedData);
        this.backOff = 0;
        if (data.steps && (data.steps.length || data.comment.length)) {
          const tr = receiveTransaction(
            this.state.edit,
            data.steps.map((json) => Step.fromJSON(this.schema, json)),
            data.clientIDs
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
      }
    );
  }

  sendable(editState) {
    const steps = sendableSteps(editState);
    if (steps) return { steps };
  }

  // Send the given steps to the server
  send(editState, { steps }) {
    const json = JSON.stringify({
      version: getVersion(editState),
      steps: steps ? steps.steps.map((step) => step.toJSON()) : [],
      clientID: steps ? steps.clientID : 0,
    });
    this.run(POST(`${this.url}/events`, json, "application/json")).then(
      () => {
        this.report.success();
        this.backOff = 0;
        const tr = steps
          ? receiveTransaction(
              this.state.edit,
              steps.steps,
              repeat(steps.clientID, steps.steps.length)
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
      }
    );
  }

  // Try to recover from an error
  recover(err) {
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

  run(request) {
    this.request = request;
    return this.request;
  }

  close() {
    this.closeRequest();
    this.setView(null);
  }

  setView(view) {
    if (this.view) this.view.destroy();
    window.view = view;
    this.view = view;
  }
}
