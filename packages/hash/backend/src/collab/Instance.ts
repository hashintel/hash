import { ApolloClient } from "@apollo/client";
import { createProseMirrorState } from "@hashintel/hash-shared/createProseMirrorState";
import { BlockEntity } from "@hashintel/hash-shared/entity";
import { createEntityStore } from "@hashintel/hash-shared/entityStore";
import {
  findComponentNodes,
  getComponentNodeAttrs,
} from "@hashintel/hash-shared/prosemirror";
import { ProsemirrorSchemaManager } from "@hashintel/hash-shared/ProsemirrorSchemaManager";
import { getPageQuery } from "@hashintel/hash-shared/queries/page.queries";
import { updatePageMutation } from "@hashintel/hash-shared/save";
import { Schema } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { Mapping, Step, Transform } from "prosemirror-transform";
import { InvalidVersionError } from "./InvalidVersionError";
import { Waiting } from "./Waiting";

const MAX_STEP_HISTORY = 10000;

// A collaborative editing document instance.
export class Instance {
  // The version number of the document instance.
  version = 0;
  steps: Step[] = [];
  lastActive = Date.now();
  users: Record<string, boolean> = Object.create(null);
  userCount = 0;
  waiting: Waiting[] = [];
  saveChain = Promise.resolve();
  saveMapping: Mapping | null = null;
  collecting: ReturnType<typeof setInterval> | null = null;
  clientIds = new WeakMap<Step, string>();

  constructor(
    public accountId: string,
    public pageEntityId: string,
    public state: EditorState<Schema>,
    public manager: ProsemirrorSchemaManager,
    public savedContents: BlockEntity[]
  ) {}

  stop() {
    if (this.collecting != null) clearInterval(this.collecting);
  }

  addEvents =
    (apolloClient: ApolloClient<unknown>) =>
    (version: number, steps: Step[], clientID: string) => {
      this.checkVersion(version);
      if (this.version !== version) return false;
      const tr = this.state.tr;

      for (let i = 0; i < steps.length; i++) {
        this.clientIds.set(steps[i], clientID);

        const result = tr.maybeStep(steps[i]);
        if (!result.doc) return false;
        if (this.saveMapping) {
          this.saveMapping.appendMap(steps[i].getMap());
        }
      }
      this.state = this.state.apply(tr);

      // this.doc = doc;
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
      .catch()
      .then(() => {
        this.saveMapping = mapping;

        return updatePageMutation(
          this.accountId,
          this.pageEntityId,
          this.state.doc,
          this.savedContents,
          // @todo get this from this.state
          createEntityStore(this.savedContents, {}),
          apolloClient
        ).then((newPage) => {
          const componentNodes = findComponentNodes(this.state.doc);

          // @todo need to inform the prosemirror plugin of this
          this.savedContents = newPage.properties.contents;

          for (let idx = 0; idx < componentNodes.length; idx++) {
            const [componentNode, pos] = componentNodes[idx];

            const entity = newPage.properties.contents[idx];

            if (!entity) {
              throw new Error("Could not find block in saved page");
            }

            if (!componentNode.attrs.blockEntityId) {
              const transform = new Transform<Schema>(this.state.doc);
              const attrs = getComponentNodeAttrs(entity);
              const mappedPos = mapping.map(pos);
              const blockWithAttrs = this.state.doc.childAfter(mappedPos).node;

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
    async (
      version: number,
      jsonSteps: any[],
      clientId: string,
      blockIds: string[]
    ) => {
      /**
       * This is a potential security risk as the frontend can instruct us
       * to make a web request
       */
      await Promise.all(
        blockIds.map((id) => this.manager.defineRemoteBlock(id))
      );

      const steps = jsonSteps.map((step) =>
        Step.fromJSON(this.state.doc.type.schema, step)
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
      throw new InvalidVersionError(version);
    }
  }

  // : (Number, Number)
  // Get events between a given document version and
  // the current document version.
  getEvents(version: number) {
    this.checkVersion(version);
    const startIndex = this.steps.length - (this.version - version);
    if (startIndex < 0) return false;

    const steps = this.steps.slice(startIndex);
    return {
      steps,
      users: this.userCount,
      clientIDs: steps.map((step) => this.clientIds.get(step)),
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

  _registerUser(ip: string | null) {
    if (ip !== null && !(ip in this.users)) {
      this.users[ip] = true;
      this.userCount++;
      if (this.collecting == null) {
        this.collecting = setTimeout(() => this.collectUsers(), 5000);
      }
    }
  }
}

const instances: Record<string, Instance> = Object.create(null);
let instanceCount = 0;
const maxCount = 20;

const newInstance =
  (apolloClient: ApolloClient<unknown>) =>
  async (accountId: string, pageEntityId: string) => {
    if (++instanceCount > maxCount) {
      let oldest = null;
      for (const instanceId of Object.keys(instances)) {
        const inst = instances[instanceId];
        if (!oldest || inst.lastActive < oldest.lastActive) oldest = inst;
      }
      if (oldest) {
        instances[oldest.pageEntityId].stop();
        delete instances[oldest.pageEntityId];
        --instanceCount;
      }
    }

    const { data } = await apolloClient.query({
      query: getPageQuery,
      variables: { entityId: pageEntityId, accountId },
    });

    const state = createProseMirrorState();

    const manager = new ProsemirrorSchemaManager(state.schema);

    /**
     * @todo check plugins
     */
    const newState = state.apply(
      await manager.createEntityUpdateTransaction(
        data.page.properties.contents,
        state
      )
    );

    // The instance may have been created whilst another user we were doing the above work
    if (instances[pageEntityId]) {
      return instances[pageEntityId];
    }

    instances[pageEntityId] = new Instance(
      accountId,
      pageEntityId,
      newState,
      manager,
      data.page.properties.contents
    );

    return instances[pageEntityId];
  };

export const getInstance =
  (apolloClient: ApolloClient<unknown>) =>
  async (accountId: string, pageEntityId: string, ip: string | null) => {
    const inst =
      instances[pageEntityId] ||
      (await newInstance(apolloClient)(accountId, pageEntityId));
    if (ip) inst.registerUser(ip);
    inst.lastActive = Date.now();
    return inst;
  };
