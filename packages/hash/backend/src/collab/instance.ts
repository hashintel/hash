import { ApolloClient } from "@apollo/client";
import { BlockEntity } from "@hashintel/hash-shared/entity";
import { createEntityStore } from "@hashintel/hash-shared/entityStore";
import {
  createEntityUpdateTransaction,
  createProseMirrorState,
  getProseMirrorNodeAttributes,
} from "@hashintel/hash-shared/prosemirror";
import { getPageQuery } from "@hashintel/hash-shared/queries/page.queries";
import { updatePageMutation } from "@hashintel/hash-shared/save";
import { findEntityNodes } from "@hashintel/hash-shared/util";
import { Node } from "prosemirror-model";
import { Mapping, Step, Transform } from "prosemirror-transform";
// @todo fix this
import { Waiting } from "./server";

// @todo rename id to pageEntityId

const MAX_STEP_HISTORY = 10000;

class StatusError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// A collaborative editing document instance.
class Instance {
  // The version number of the document instance.
  version = 0;
  steps: Step[] = [];
  lastActive = Date.now();
  // @todo type this
  users: Record<string, unknown> = Object.create(null);
  userCount = 0;
  // @todo type this
  waiting: Waiting[] = [];
  saveChain = Promise.resolve();
  saveMapping: Mapping | null = null;
  collecting: ReturnType<typeof setInterval> | null = null;

  // eslint-disable-next-line no-useless-constructor
  constructor(
    public accountId: string,
    public id: string,
    public doc: Node,
    public savedContents: BlockEntity[] // eslint-disable-next-line no-empty-function
  ) {}

  stop() {
    if (this.collecting != null) clearInterval(this.collecting);
  }

  addEvents =
    (apolloClient: ApolloClient<unknown>) =>
    (version: number, steps: Step[], clientID: string) => {
      this.checkVersion(version);
      if (this.version !== version) return false;
      let doc = this.doc;
      for (let i = 0; i < steps.length; i++) {
        // @todo fix this
        // @ts-ignore-error
        // eslint-disable-next-line no-param-reassign
        steps[i].clientID = clientID;
        const result = steps[i].apply(doc);
        if (!result.doc) return false;
        if (this.saveMapping) {
          this.saveMapping.appendMap(steps[i].getMap());
        }
        doc = result.doc;
      }
      this.doc = doc;
      this.version += steps.length;
      this.steps = this.steps.concat(steps);
      if (this.steps.length > MAX_STEP_HISTORY) {
        this.steps = this.steps.slice(this.steps.length - MAX_STEP_HISTORY);
      }

      this.sendUpdates();

      // @todo offload saves to a separate process / debounce them
      this.save(apolloClient)(clientID);

      return { version: this.version };
    };

  save = (apolloClient: ApolloClient<unknown>) => (clientID: string) => {
    const mapping = new Mapping();

    this.saveChain = this.saveChain
      .catch(() => {})
      .then(() => {
        this.saveMapping = mapping;

        return updatePageMutation(
          this.accountId,
          this.id,
          this.doc,
          this.savedContents,
          createEntityStore(this.savedContents),
          apolloClient
        ).then((newPage) => {
          const entityNodes = findEntityNodes(this.doc);

          this.savedContents = newPage.properties.contents;

          for (let idx = 0; idx < entityNodes.length; idx++) {
            const [entityNode, pos] = entityNodes[idx];

            const entity = newPage.properties.contents[idx];

            if (!entity) {
              throw new Error("Could not find block in saved page");
            }

            if (!entityNode.attrs.entityId) {
              const transform = new Transform(this.doc);
              const attrs = getProseMirrorNodeAttributes(entity);
              const mappedPos = mapping.map(pos);
              const blockWithAttrs = this.doc.childAfter(mappedPos).node;

              // @todo use a custom step for this so we don't need to copy attrs – we may lose some
              transform.setNodeMarkup(mappedPos, undefined, {
                ...blockWithAttrs?.attrs,
                ...attrs,
              });

              this.addEvents(apolloClient)(
                this.version,
                transform.steps,
                `${clientID}-server`
              );
            }
          }
        });
      })
      .catch((err) => {
        console.error("could not save", err);
      })

      .finally(() => {
        if (this.saveMapping === mapping) {
          this.saveMapping = null;
        }
      });
  };

  addJsonEvents =
    (apolloClient: ApolloClient<unknown>) =>
    (version: number, jsonSteps: any[], clientId: string) => {
      const steps = jsonSteps.map((step) =>
        Step.fromJSON(this.doc.type.schema, step)
      );

      return this.addEvents(apolloClient)(version, steps, clientId);
    };

  sendUpdates() {
    while (this.waiting.length) this.waiting.pop()?.finish();
  }

  // : (Number)
  // Check if a document version number relates to an existing
  // document version.
  checkVersion(version: number) {
    if (version < 0 || version > this.version) {
      throw new StatusError(400, `Invalid version ${version}`);
    }
  }

  // : (Number, Number)
  // Get events between a given document version and
  // the current document version.
  getEvents(version: number) {
    this.checkVersion(version);
    const startIndex = this.steps.length - (this.version - version);
    if (startIndex < 0) return false;

    return {
      steps: this.steps.slice(startIndex),
      users: this.userCount,
    };
  }

  collectUsers() {
    const oldUserCount = this.userCount;
    this.users = Object.create(null);
    this.userCount = 0;
    this.collecting = null;
    for (let i = 0; i < this.waiting.length; i++) {
      this._registerUser(this.waiting[i].ip);
    }
    if (this.userCount !== oldUserCount) this.sendUpdates();
  }

  registerUser(ip: string) {
    if (!(ip in this.users)) {
      this._registerUser(ip);
      this.sendUpdates();
    }
  }

  _registerUser(ip: string) {
    if (!(ip in this.users)) {
      this.users[ip] = true;
      this.userCount++;
      if (this.collecting == null) {
        this.collecting = setTimeout(() => this.collectUsers(), 5000);
      }
    }
  }
}

const instances = Object.create(null);
let instanceCount = 0;
const maxCount = 20;

const newInstance =
  (apolloClient: ApolloClient<unknown>) =>
  async (accountId: string, id: string) => {
    if (++instanceCount > maxCount) {
      let oldest = null;
      for (const instanceId of Object.keys(instances)) {
        const inst = instances[instanceId];
        if (!oldest || inst.lastActive < oldest.lastActive) oldest = inst;
      }
      instances[oldest.id].stop();
      delete instances[oldest.id];
      --instanceCount;
    }

    const { data } = await apolloClient.query({
      query: getPageQuery,
      variables: { entityId: id, accountId },
    });

    const state = createProseMirrorState();

    const newState = state.apply(
      await createEntityUpdateTransaction(
        state,
        data.page.properties.contents,
        null
      )
    );

    // The instance may have been created whilst another user we were doing the above work
    if (instances[id]) {
      return instances[id];
    }

    instances[id] = new Instance(
      accountId,
      id,
      newState.doc,
      data.page.properties.contents
    );

    return instances[id];
  };

export const getInstance =
  (apolloClient: ApolloClient<unknown>) =>
  async (accountId: string, id: string, ip: string) => {
    const inst =
      instances[id] || (await newInstance(apolloClient)(accountId, id));
    if (ip) inst.registerUser(ip);
    inst.lastActive = Date.now();
    return inst;
  };
