import { ApolloClient } from "@apollo/client";
import { EntityVersion } from "@hashintel/hash-backend-utils/pgTables";
import { CollabPosition } from "@hashintel/hash-shared/collab";
import { createProseMirrorState } from "@hashintel/hash-shared/createProseMirrorState";
import { BlockEntity } from "@hashintel/hash-shared/entity";
import {
  createEntityStore,
  EntityStore,
  walkValueForEntity,
} from "@hashintel/hash-shared/entityStore";
import {
  addEntityStoreAction,
  entityStoreFromProsemirror,
} from "@hashintel/hash-shared/entityStorePlugin";
import {
  findComponentNodes,
  getComponentNodeAttrs,
} from "@hashintel/hash-shared/prosemirror";
import { ProsemirrorSchemaManager } from "@hashintel/hash-shared/ProsemirrorSchemaManager";
import { getPageQuery } from "@hashintel/hash-shared/queries/page.queries";
import { updatePageMutation } from "@hashintel/hash-shared/save";
import { Response } from "express";
import { isEqual } from "lodash";
import { Schema, Slice } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { Mapping, ReplaceStep, Step, Transform } from "prosemirror-transform";
import { EntityWatcher } from "./EntityWatcher";
import { InvalidVersionError } from "./errors";
import { CollabPositionPoller, TimedCollabPosition } from "./types";
import { Waiting } from "./Waiting";

const MAX_STEP_HISTORY = 10000;

const POSITION_EXPIRY_TIMEOUT = 1000 * 60;
const POSITION_CLEANUP_INTERVAL = 1000 * 10;

const isUnused = (response: Response): boolean => {
  return (
    !response.headersSent && !response.destroyed && !response.writableEnded
  );
};

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
  collecting: ReturnType<typeof setTimeout> | null = null;
  clientIds = new WeakMap<Step, string>();

  positionPollers: CollabPositionPoller[] = [];
  timedPositions: TimedCollabPosition[] = [];
  positionCleanupInterval: ReturnType<typeof setInterval>;

  private entityStore: { version: number; store: EntityStore };

  private readonly unsubscribeFromEntityWatcher: () => void;

  constructor(
    public accountId: string,
    public pageEntityId: string,
    public state: EditorState<Schema>,
    public manager: ProsemirrorSchemaManager,
    public savedContents: BlockEntity[],
    private entityWatcher: EntityWatcher,
  ) {
    this.positionCleanupInterval = setInterval(() => {
      this.cleanupPositions();
      this.cleanupPositionPollers();
    }, POSITION_CLEANUP_INTERVAL);

    this.entityStore = {
      version: this.version,
      store: entityStoreFromProsemirror(state).store,
    };

    this.unsubscribeFromEntityWatcher = this.entityWatcher.subscribe(
      (version) => this.processEntityVersion(version),
    );
  }

  stop() {
    if (this.collecting != null) clearTimeout(this.collecting);

    clearInterval(this.positionCleanupInterval);

    for (const { response } of this.positionPollers) {
      if (isUnused(response)) {
        response.status(410).send("Collab instance was stopped");
      }
    }
    this.unsubscribeFromEntityWatcher();
  }

  private async processEntityVersion(entityVersion: EntityVersion) {
    let foundOnPage = false;

    const nextSavedContents = walkValueForEntity(
      this.savedContents,
      (entity) => {
        if (entity.entityId === entityVersion.entityId) {
          foundOnPage = true;
          if (
            new Date(entityVersion.updatedAt).getTime() >
            new Date(entity.updatedAt).getTime()
          ) {
            return {
              ...entity,
              accountId: entityVersion.accountId,
              entityVersionId: entityVersion.entityTypeVersionId,
              entityTypeVersionId: entityVersion.entityTypeVersionId,
              // @todo what happens with links!?
              properties: entityVersion.properties,
              createdById: entityVersion.createdBy,
              createdAt: entityVersion.createdAt.toISOString(),
              updatedAt: entityVersion.updatedAt.toISOString(),
            };
          }
        }

        return entity;
      },
    );

    if (foundOnPage) {
      /**
       * We should know not to notify consumers of changes they've already been
       * notified of, but because of a race condition between saves triggered by
       * collab and saves triggered by frontend blocks, this doesn't necessarily
       * work, so unfortunately we need to notify on every notification from
       * realtime right now. This means clients will be notified about prosemirror
       * changes twice right now. There are no known downsides to this other than
       * performance.
       *
       * If nextSavedContents === this.savedContents, then we're likely notifying
       * of changes the client is possibly already aware of
       *
       * @todo fix this
       */
      this.updateSavedContents(nextSavedContents, true);
    }
  }

  private updateSavedContents(nextSavedContents: BlockEntity[], notify = true) {
    const { tr } = this.state;
    addEntityStoreAction(tr, { type: "contents", payload: nextSavedContents });
    this.state = this.state.apply(tr);
    this.savedContents = nextSavedContents;

    this.entityStore = {
      version: notify ? this.version + 1 : this.version,
      store: entityStoreFromProsemirror(this.state).store,
    };

    if (notify) {
      /**
       * This is a hack to do with version number hacking
       * @todo come up with something better
       */
      this.addEvents()(
        this.version,
        [new ReplaceStep<Schema>(0, 0, Slice.empty)],
        "graphql",
      );
    }
  }

  addEvents =
    (apolloClient?: ApolloClient<unknown>) =>
    (version: number, steps: Step[], clientID: string) => {
      this.checkVersion(version);
      if (this.version !== version) return false;
      const tr = this.state.tr;

      for (let i = 0; i < steps.length; i++) {
        this.clientIds.set(steps[i], clientID);

        const result = tr.maybeStep(steps[i]);
        if (!result.doc) return false;
        // @todo look into whether this is needed now we use a tr
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

      if (apolloClient) {
        // @todo offload saves to a separate process / debounce them
        this.save(apolloClient)(clientID);
      }

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
          apolloClient,
        ).then((newPage) => {
          const componentNodes = findComponentNodes(this.state.doc);

          this.updateSavedContents(newPage.properties.contents, false);

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

              // @todo need to do this outside the loop
              this.addEvents(apolloClient)(
                this.version,
                transform.steps,
                `${clientID}-server`,
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
      blockIds: string[],
    ) => {
      /**
       * This is a potential security risk as the frontend can instruct us
       * to make a web request
       */
      await Promise.all(
        blockIds.map((id) => this.manager.defineRemoteBlock(id)),
      );

      const steps = jsonSteps.map((step) =>
        Step.fromJSON(this.state.doc.type.schema, step),
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
    const store =
      this.entityStore.version > version ? this.entityStore.store : null;

    return {
      steps,
      users: this.userCount,
      clientIDs: steps.map((step) => this.clientIds.get(step)),
      store,
    };
  }

  collectUsers() {
    const oldUserCount = this.userCount;
    this.users = Object.create(null);
    this.userCount = 0;
    this.collecting = null;
    for (let i = 0; i < this.waiting.length; i++) {
      this._registerUser(this.waiting[i].userId);
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

  extractPositions(userIdToExclude: string | null): CollabPosition[] {
    return this.timedPositions
      .filter((timedPosition) => timedPosition.userId !== userIdToExclude)
      .sort((a, b) => (a.userId < b.userId ? -1 : 1))
      .map(({ reportedAt: _, ...position }) => position);
  }

  registerPosition({
    userId,
    userShortname,
    userPreferredName,
    entityId,
  }: {
    userId: string;
    userShortname: string;
    userPreferredName: string;
    entityId: string | null;
  }): void {
    const currentTimestamp = Date.now();

    const timedPositionIndex = this.timedPositions.findIndex(
      (timedPosition) => timedPosition.userId === userId,
    );

    if (timedPositionIndex !== -1) {
      if (entityId) {
        const existingPosition = this.timedPositions[timedPositionIndex];
        existingPosition.entityId = entityId;
        existingPosition.reportedAt = currentTimestamp;
      } else {
        this.timedPositions.splice(timedPositionIndex, 1);
      }
    } else if (entityId) {
      this.timedPositions.push({
        userId,
        userShortname,
        userPreferredName,
        entityId,
        reportedAt: currentTimestamp,
      });
    }

    this.notifyPositionPollers();
  }

  cleanupPositions() {
    const previousNumberOfPositions = this.timedPositions.length;
    const currentTimestamp = Date.now();

    this.timedPositions = this.timedPositions.filter(
      ({ reportedAt }) =>
        reportedAt + POSITION_EXPIRY_TIMEOUT >= currentTimestamp,
    );

    if (this.timedPositions.length !== previousNumberOfPositions) {
      this.notifyPositionPollers();
    }
  }

  addPositionPoller(positionPoller: CollabPositionPoller) {
    this.positionPollers.push(positionPoller);
  }

  notifyPositionPollers() {
    for (const { baselinePositions, userIdToExclude, response } of this
      .positionPollers) {
      const positions = this.extractPositions(userIdToExclude);
      if (!isEqual(baselinePositions, positions) && isUnused(response)) {
        response.json(positions);
      }
    }

    setImmediate(() => {
      this.cleanupPositionPollers();
    });
  }

  cleanupPositionPollers() {
    this.positionPollers = this.positionPollers.filter(({ response }) =>
      isUnused(response),
    );
  }
}

const instances: Record<string, Instance> = Object.create(null);
let instanceCount = 0;
const maxCount = 20;

const newInstance =
  (apolloClient: ApolloClient<unknown>, entityWatcher: EntityWatcher) =>
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
        state,
      ),
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
      data.page.properties.contents,
      entityWatcher,
    );

    return instances[pageEntityId];
  };

export const getInstance =
  (apolloClient: ApolloClient<unknown>, entityWatcher: EntityWatcher) =>
  async (accountId: string, pageEntityId: string, userId: string | null) => {
    const inst =
      instances[pageEntityId] ||
      (await newInstance(apolloClient, entityWatcher)(accountId, pageEntityId));
    if (userId) inst.registerUser(userId);
    inst.lastActive = Date.now();
    return inst;
  };
