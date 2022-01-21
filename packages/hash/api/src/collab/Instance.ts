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
  entityStorePluginState,
} from "@hashintel/hash-shared/entityStorePlugin";
import {
  GetEntityQuery,
  GetEntityQueryVariables,
  GetPageQuery,
  GetPageQueryVariables,
} from "@hashintel/hash-shared/graphql/apiTypes.gen";
import {
  getComponentNodeAttrs,
  isComponentNode,
} from "@hashintel/hash-shared/prosemirror";
import { ProsemirrorSchemaManager } from "@hashintel/hash-shared/ProsemirrorSchemaManager";
import { getEntity } from "@hashintel/hash-shared/queries/entity.queries";
import { getPageQuery } from "@hashintel/hash-shared/queries/page.queries";
import { updatePageMutation } from "@hashintel/hash-shared/save";
import { Response } from "express";
import { isEqual } from "lodash";
import { Schema } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { Mapping, Step, Transform } from "prosemirror-transform";
import { logger } from "../logger";
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

type StepUpdate = {
  type: "step";
  payload: Step<Schema>;
};

type StoreUpdate = {
  type: "store";
  payload: EntityStore;
};
type Update = StepUpdate | StoreUpdate;

// A collaborative editing document instance.
export class Instance {
  // The version number of the document instance.
  version = 0;
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

  /**
   * @todo absorb position updates into this
   */
  private updates: Update[] = [];

  private readonly unsubscribeFromEntityWatcher: () => void;

  constructor(
    public accountId: string,
    public pageEntityId: string,
    public state: EditorState<Schema>,
    public manager: ProsemirrorSchemaManager,
    public savedContents: BlockEntity[],
    private entityWatcher: EntityWatcher,

    /**
     * Occasionally we need an apollo client when not in the process of
     * handling a request from a user, so we require a fallback client when
     * creating an Instance.
     *
     * @todo replace this with a machine user
     */
    private fallbackClient: ApolloClient<unknown>,
  ) {
    this.positionCleanupInterval = setInterval(() => {
      this.cleanupPositions();
      this.cleanupPositionPollers();
    }, POSITION_CLEANUP_INTERVAL);

    this.unsubscribeFromEntityWatcher = this.entityWatcher.subscribe(
      (entityVersion) => this.processEntityVersion(entityVersion),
    );
  }

  stop() {
    this.sendUpdates();
    if (this.collecting != null) clearTimeout(this.collecting);

    clearInterval(this.positionCleanupInterval);

    for (const { response } of this.positionPollers) {
      if (isUnused(response)) {
        response.status(410).send("Collab instance was stopped");
      }
    }
    this.unsubscribeFromEntityWatcher();
  }

  /**
   * This has a non-ideal implementation as we have to walk the entity tree
   * twice – the first time to work out if the entity version we've received is
   * relevant to this document, and the second to apply the update to our
   * entities. This is because in the middle of those two things, we need to
   * talk to the GraphQL server to resolve links on the incoming entity, and
   * walkValueForEntity cannot handle async operations
   */
  private async processEntityVersion(entityVersion: EntityVersion) {
    let foundOnPage = false;
    const entityVersionsToUpdate = new Set<string>();
    const entityVersionTime = new Date(entityVersion.updatedAt).getTime();

    walkValueForEntity(this.savedContents, (entity) => {
      if (entity.entityId === entityVersion.entityId) {
        foundOnPage = true;

        if (entityVersionTime > new Date(entity.updatedAt).getTime()) {
          entityVersionsToUpdate.add(entity.entityVersionId);
        }
      }

      return entity;
    });

    if (foundOnPage && entityVersionsToUpdate.size > 0) {
      const { data } = await this.fallbackClient.query<
        GetEntityQuery,
        GetEntityQueryVariables
      >({
        query: getEntity,
        variables: {
          entityId: entityVersion.entityId,
          accountId: entityVersion.accountId,
        },
        fetchPolicy: "network-only",
      });

      const nextSavedContents = walkValueForEntity(
        this.savedContents,
        (entity) => {
          if (entityVersionsToUpdate.has(entity.entityVersionId)) {
            return {
              ...entity,
              accountId: entityVersion.accountId,
              entityVersionId: entityVersion.entityVersionId,
              entityTypeVersionId: entityVersion.entityTypeVersionId,
              /**
               * This could overwrite any updates applied to entities inside of
               * this properties field, but not a lot we can do about that, and
               * unlikely to actually cause an issue as we process entity
               * updates one at a time.
               *
               * @todo remove this comment when we have flat entities
               */
              properties: data.entity.properties,
              createdByAccountId: entityVersion.updatedByAccountId,
              createdAt: entityVersion.updatedAt.toISOString(),
              updatedAt: entityVersion.updatedAt.toISOString(),
            };
          }

          return entity;
        },
      );

      /**
       * We should know not to notify consumers of changes they've already been
       * notified of, but because of a race condition between saves triggered
       * by collab and saves triggered by frontend blocks, this doesn't
       * necessarily work, so unfortunately we need to notify on every
       * notification from realtime right now. This means clients will be
       * notified about prosemirror changes twice right now. There are no known
       * downsides to this other than performance.
       *
       * If nextSavedContents === this.savedContents, then we're likely
       * notifying of changes the client is possibly already aware of
       *
       * @todo fix this
       */
      this.updateSavedContents(nextSavedContents);
    }
  }

  private updateSavedContents(nextSavedContents: BlockEntity[]) {
    const { tr } = this.state;
    addEntityStoreAction(this.state, tr, {
      type: "mergeNewPageContents",
      payload: nextSavedContents,
    });
    this.state = this.state.apply(tr);
    this.savedContents = nextSavedContents;
    this.recordStoreUpdate();
  }

  /**
   * @todo remove this – we should be able to send the tracked actions to other
   *       clients, instead of the whole store
   */
  private recordStoreUpdate() {
    this.addUpdates([
      {
        type: "store",
        payload: entityStorePluginState(this.state).store,
      },
    ]);
    this.sendUpdates();
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
        if (this.saveMapping) {
          this.saveMapping.appendMap(steps[i].getMap());
        }
      }
      this.state = this.state.apply(tr);

      // this.doc = doc;
      this.addUpdates(steps.map((step) => ({ type: "step", payload: step })));
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
        const { doc } = this.state;

        return updatePageMutation(
          this.accountId,
          this.pageEntityId,
          doc,
          this.savedContents,
          // @todo get this from this.state
          createEntityStore(this.savedContents, {}),
          apolloClient,
        ).then((newPage) => {
          /**
           * This is purposefully based on the current doc, not the doc at
           * the time of save, because we need to apply transforms to the
           * current doc based on the result of the save query (in order to
           * insert entity ids for new blocks)
           */
          const transform = new Transform<Schema>(this.state.doc);

          /**
           * We need to look through our doc for any nodes that were missing
           * entityIds (i.e, that are new) and insert them from the save.
           *
           * @todo allow the client to pick entity ids to remove the need to
           * do this
           */
          doc.descendants((node, pos) => {
            const resolved = doc.resolve(pos);
            const idx = resolved.index(0);
            const blockEntity = newPage.properties.contents[idx];

            if (!blockEntity) {
              throw new Error("Cannot find block node in save result");
            }

            if (isComponentNode(node) && !node.attrs.blockEntityId) {
              transform.setNodeMarkup(
                mapping.map(pos),
                undefined,
                getComponentNodeAttrs(blockEntity),
              );
            }
          });

          if (transform.docChanged) {
            this.addEvents(apolloClient)(
              this.version,
              transform.steps,
              `${clientID}-server`,
            );
          }

          this.updateSavedContents(newPage.properties.contents);
        });
      })
      .catch((err) => {
        logger.error("could not save", err);
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
       * This isn't strictly necessary, and will result in more laggy collab
       * performance. However, it is a quick way to improve stability by
       * reducing moving parts – because it means each client will not try to
       * send another set of updates until the previous updates (even those
       * from other clients are finished saving). This is a good way to improve
       * stability until we're more confident in collab not breaking with
       * frequent updates.
       *
       * @todo remove this
       */
      await this.saveChain;

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

      const res = this.addEvents(apolloClient)(version, steps, clientId);

      /**
       * This isn't strictly necessary, and will result in more laggy collab
       * performance. However, it is a quick way to improve stability by
       * reducing moving parts – because it means each client will not try to
       * send another set of updates until the previous updates (even those
       * from other clients are finished saving). This is a good way to improve
       * stability until we're more confident in collab not breaking with
       * frequent updates.
       *
       * @todo remove this
       */
      await this.saveChain;

      return res;
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

  /**
   * Get events between a given document version and the current document
   * version.
   */
  getEvents(version: number) {
    this.checkVersion(version);
    const startIndex = this.updates.length - (this.version - version);
    if (startIndex < 0) return false;

    const updates = this.updates.slice(startIndex);
    const steps = updates
      .filter((update): update is StepUpdate => update.type === "step")
      .map((update) => update.payload);

    const store =
      [...updates]
        .reverse()
        .find((update): update is StoreUpdate => update.type === "store")
        ?.payload ?? null;

    return {
      steps,
      users: this.userCount,
      clientIDs: steps.map((step) => this.clientIds.get(step)),
      store,
      shouldRespondImmediately: updates.length > 0,
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

  /**
   * @todo do we want to force sending updates here too?
   */
  private addUpdates(updates: Update[]) {
    this.updates = [...this.updates, ...updates];

    /**
     * @todo this needs to be synced with the collab plugin on the frontend
     *       which is based on steps, so it's not as simple as this
     */
    this.version += updates.length;

    if (this.updates.length > MAX_STEP_HISTORY) {
      this.updates = this.updates.slice(this.updates.length - MAX_STEP_HISTORY);
    }
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

    const { data } = await apolloClient.query<
      GetPageQuery,
      GetPageQueryVariables
    >({
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
      apolloClient,
    );

    return instances[pageEntityId];
  };

export const getInstance =
  (apolloClient: ApolloClient<unknown>, entityWatcher: EntityWatcher) =>
  async (
    accountId: string,
    pageEntityId: string,
    userId: string | null,
    forceNewInstance = false,
  ) => {
    if (forceNewInstance) {
      instances[pageEntityId]?.stop();
      delete instances[pageEntityId];
    }
    const inst =
      instances[pageEntityId] ||
      (await newInstance(apolloClient, entityWatcher)(accountId, pageEntityId));
    if (userId) inst.registerUser(userId);
    inst.lastActive = Date.now();
    return inst;
  };
