import { ApolloClient } from "@apollo/client";
import { EntityVersion } from "@hashintel/hash-backend-utils/pgTables";
import { CollabPosition, DocumentChange } from "@hashintel/hash-shared/collab";
import { createProseMirrorState } from "@hashintel/hash-shared/createProseMirrorState";
import {
  BlockEntity,
  flatMapBlocks,
  isTextContainingEntityProperties,
} from "@hashintel/hash-shared/entity";
import { EntityStore } from "@hashintel/hash-shared/entityStore";
import {
  addEntityStoreAction,
  disableEntityStoreTransactionInterpretation,
  EntityStorePluginAction,
  entityStorePluginState,
} from "@hashintel/hash-shared/entityStorePlugin";
import {
  GetBlocksQuery,
  GetBlocksQueryVariables,
  GetPageQuery,
  GetPageQueryVariables,
  LatestEntityRef,
} from "@hashintel/hash-shared/graphql/apiTypes.gen";
import { isEntityNode } from "@hashintel/hash-shared/prosemirror";
import { ProsemirrorSchemaManager } from "@hashintel/hash-shared/ProsemirrorSchemaManager";
import {
  getBlocksQuery,
  getPageQuery,
} from "@hashintel/hash-shared/queries/page.queries";
import {
  createNecessaryEntities,
  updatePageMutation,
} from "@hashintel/hash-shared/save";

import { isEqual, memoize, pick } from "lodash";
import { Schema } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { Step } from "prosemirror-transform";
import {
  clearIntervalAsync,
  setIntervalAsync,
  SetIntervalAsyncTimer,
} from "set-interval-async/dynamic";
import { promise as asyncQueue, queue as Queue } from "fastq";

import { logger } from "../logger";
import { genId } from "../util";
import { EntityWatcher } from "./EntityWatcher";
import { InvalidVersionError } from "./errors";
import {
  CollabPositionSubscription,
  DocumentChangeSubscription,
  TimedCollabPosition,
} from "./types";

const MAX_STEP_HISTORY = 10000;

const POSITION_EXPIRY_TIMEOUT = 1000 * 60;
const POSITION_CLEANUP_INTERVAL = 1000 * 10;

type StepUpdate = {
  type: "step";
  payload: Step<Schema>;
};

type StoreUpdate = {
  type: "store";
  payload: EntityStore;
};

type ActionUpdate = {
  type: "action";
  payload: EntityStorePluginAction;
};

type Update = StepUpdate | StoreUpdate | ActionUpdate;

const updatesToDocumentUpdate = (
  updates: Update[],
  clientIds: WeakMap<Step, string>,
): DocumentChange => {
  const steps = updates
    .filter((update): update is StepUpdate => update.type === "step")
    .map((update) => update.payload);

  const store =
    [...updates]
      .reverse()
      .find((update): update is StoreUpdate => update.type === "store")
      ?.payload ?? null;

  const actions = updates
    .filter((update): update is ActionUpdate => update.type === "action")
    .map((update) => update.payload);

  return {
    steps,
    // not the best assertions here
    clientIDs: steps.map((step) => clientIds.get(step)!),
    store: store!,
    actions,
  };
};

type CollabEvent = {
  apolloClient?: ApolloClient<unknown>;
  version: number;
  steps: Step[];
  clientID: string;
  actions: EntityStorePluginAction[];
  fromClient: boolean;
};

// A collaborative editing document instance.
export class Instance {
  /** The version number of the document instance. */
  version = 0;

  lastActive = Date.now();

  /**
   * Subscriptions for the current instance .
   * Instead of having multiple connections in a waiting state,
   * we use observers that are subscribed to the Instance state
   * which will be notified of any changes
   */
  subscriptions: DocumentChangeSubscription[] = [];

  saveChain = Promise.resolve();
  clientIds = new WeakMap<Step, string>();

  /** Active position subscribers */
  positionSubscription: CollabPositionSubscription[] = [];
  /** Positions in the instance */
  timedPositions: TimedCollabPosition[] = [];
  /** Interval timeout to clean up positions */
  positionCleanupInterval: ReturnType<typeof setInterval>;

  errored = false;
  stopped = false;

  /**
   * @todo absorb position updates into this
   */
  private updates: Update[] = [];

  private readonly unsubscribeFromEntityWatcher: () => void;

  /**
   * Event queue to serialize every event that comes in concurrently.
   * This is to prevent out-of-order updates to the underlying documents.
   *
   * The setup of this Instance class is resembling that of an [Erlang process](https://www.erlang.org/doc/reference_manual/processes.html)
   * where messages are all serialized into a mailbox to be handled serially.
   */
  private eventQueue: Queue<CollabEvent>;

  /**
   * The queue is consumed by a _single_ consumer to prevent any race conditions.
   * This is especially important when applying steps to the document,
   * where a large set of steps has no chance to finish before a single, out of order step comes in.
   *
   * This queue consumer will only allow a single set of steps to be processed at a time
   * through a FIFO queue.
   */
  private eventQueueConsumer: SetIntervalAsyncTimer;

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
      this.cleanupPositionSubs();
    }, POSITION_CLEANUP_INTERVAL);

    this.unsubscribeFromEntityWatcher = this.entityWatcher.subscribe(
      (entityVersion) => this.processEntityVersion(entityVersion),
    );

    // Single-worker queue for handling event updated serially
    this.eventQueue = asyncQueue(this, this.handleCollabEvent, 1);
    // Queue consumer is polled through an async interval.
    // this is different from setInterval as it will make sure to finish
    // the task before re-triggering another invocation.
    // this behaviour combined with using a worker-queue reduces out-of-rder
    // concurrency issues.
    this.eventQueueConsumer = setIntervalAsync(this.eventQueue.drain, 30);
  }

  handleCollabEvent = async (collabEvent: CollabEvent) => {
    const { apolloClient, actions, clientID, fromClient, version, steps } =
      collabEvent;
    try {
      this.checkVersion(version);
      if (this.version !== version) return false;

      const tr = this.state.tr;

      if (fromClient) {
        disableEntityStoreTransactionInterpretation(tr);
      }

      for (let i = 0; i < steps.length; i++) {
        this.clientIds.set(steps[i]!, clientID);

        const result = tr.maybeStep(steps[i]!);
        if (!result.doc) {
          logger.error("Bad step", steps[i]);
          throw new Error(`Could not apply step ${JSON.stringify(steps[i])}`);
        }
      }

      for (const action of actions) {
        addEntityStoreAction(this.state, tr, { ...action, received: true });
      }

      this.state = this.state.apply(tr);

      const updates: Update[] = [
        ...steps.map((step) => ({ type: "step" as const, payload: step })),
        ...actions.map((action) => ({
          type: "action" as const,
          payload: action,
        })),
      ];

      this.addUpdates(updates);

      if (apolloClient) {
        // @todo offload saves to a separate process / debounce them
        // eslint-disable-next-line no-console
        console.log("Saving store");
        await this.save(apolloClient)(clientID);
      }
    } catch (err) {
      this.error(err);
      return false;
    }
  };

  stop() {
    if (this.stopped) {
      return;
    }

    this.stopped = true;
    this.sendUpdates([]);

    clearInterval(this.positionCleanupInterval);

    void (async () => clearIntervalAsync(this.eventQueueConsumer))();

    for (const { error } of this.positionSubscription) {
      error?.("Collab instance was stopped");
    }
    this.unsubscribeFromEntityWatcher();
  }

  error(err: unknown) {
    if (err instanceof InvalidVersionError) {
      throw err;
    }

    if (this.errored) {
      logger.error(
        "Error encountered when instance already in errored state",
        err,
      );
      return;
    }

    logger.error(
      `Stopping instance ${this.accountId}/${this.pageEntityId}`,
      err,
    );

    this.errored = true;
    this.updates = [];
    this.sendUpdates([]);
    this.stop();
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
    if (this.errored) {
      return;
    }

    try {
      /**
       * This removes any extra properties from a passed object containing an
       * accountId and entityId, which may be an Entity or a LatestEntityRef, or
       * similar, in order to generate a LatestEntityRef with only the
       * specific properties. This allows us to create objects which identify
       * specific entities for use in GraphQL requests or comparisons. Because
       * TypeScript's "substitutability", this function can be called with objects
       * with extra properties than those specified.
       *
       * This function is memoized so that the resulting value can be used inside
       * Map or Set, or for direct comparison, in absence of support for the
       * Record proposal. The second argument to memoize allows calling this
       * function with an object.
       *
       * This is defined locally as we only need calls to be referentially equal
       * within the scope of `processEntityVersion`.
       *
       * @todo replace this with a Record once the proposal is usable
       * @see https://github.com/tc39/proposal-record-tuple
       * @see https://github.com/Microsoft/TypeScript/wiki/FAQ#substitutability
       */
      const getEntityRef = memoize(
        (ref: { accountId: string; entityId: string }): LatestEntityRef =>
          pick(ref, "accountId", "entityId"),
        ({ accountId, entityId }) => `${accountId}/${entityId}`,
      );

      const entityVersionTime = new Date(entityVersion.updatedAt).getTime();
      const entityVersionRef = getEntityRef(entityVersion);

      const blocksToRefresh = new Set(
        flatMapBlocks(this.savedContents, (entity, blockEntity) => {
          const entityRef = getEntityRef(entity);

          if (
            entityRef === entityVersionRef &&
            entityVersionTime > new Date(entity.updatedAt).getTime()
          ) {
            return [getEntityRef(blockEntity)];
          }

          return [];
        }),
      );

      if (blocksToRefresh.size) {
        const refreshedBlocksQuery = await this.fallbackClient.query<
          GetBlocksQuery,
          GetBlocksQueryVariables
        >({
          query: getBlocksQuery,
          variables: {
            blocks: Array.from(blocksToRefresh.values()),
          },
          fetchPolicy: "network-only",
        });

        const refreshedPageBlocks = new Map<LatestEntityRef, BlockEntity>(
          refreshedBlocksQuery.data.blocks.map(
            (block) => [getEntityRef(block), block] as const,
          ),
        );

        const nextSavedContents = this.savedContents.map((block) => {
          const blockRef = getEntityRef(block);

          if (blocksToRefresh.has(blockRef)) {
            const refreshedBlock = refreshedPageBlocks.get(blockRef);

            if (!refreshedBlock) {
              throw new Error("Cannot find updated block in updated page");
            }

            return refreshedBlock;
          }

          return block;
        });

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
    } catch (err) {
      this.error(err);
    }
  }

  private updateSavedContents(nextSavedContents: BlockEntity[]) {
    if (this.errored) {
      return;
    }

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
  }

  /**
   * When adding events to be processed by the document Instance,
   * it is added to a queue, which will apply events one at a time
   * to prevent any out-of-order concurrency issues.
   *
   * Since the queue doesn't apply the changes immediately, the version
   * is not updated immediately either.
   */
  addEvents =
    (apolloClient?: ApolloClient<unknown>) =>
    async (
      version: number,
      steps: Step[],
      clientID: string,
      actions: EntityStorePluginAction[] = [],
      fromClient = true,
    ) => {
      if (this.errored) {
        return false;
      }

      this.eventQueue.push({
        apolloClient,
        version,
        steps,
        clientID,
        actions,
        fromClient,
      });
    };

  save = (apolloClient: ApolloClient<unknown>) => async (clientID: string) => {
    this.saveChain = this.saveChain
      .catch()
      .then(async () => {
        if (this.errored) {
          throw new Error("Saving when instance stopped");
        }

        const { actions, createdEntities } = await createNecessaryEntities(
          this.state,
          this.accountId,
          apolloClient,
        );

        if (actions.length) {
          await this.addEvents(apolloClient)(
            this.version,
            [],
            `${clientID}-server`,
            actions,
          );
        }

        return createdEntities;
      })
      .then((createdEntities) => {
        const { doc } = this.state;
        const store = entityStorePluginState(this.state);

        return updatePageMutation(
          this.accountId,
          this.pageEntityId,
          doc,
          this.savedContents,
          entityStorePluginState(this.state).store,
          apolloClient,
          createdEntities,
        ).then(async (newPage) => {
          const actions: EntityStorePluginAction[] = [];

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

            if (isEntityNode(node)) {
              let targetEntityId: string;

              if (!node.attrs.draftId) {
                throw new Error(
                  "Cannot process save when node missing a draft id",
                );
              }

              /**
               * @todo doesn't update entity id for text containing entities
               *       when created
               */
              switch (resolved.depth) {
                case 1:
                  targetEntityId = blockEntity.entityId;
                  break;

                case 2:
                  targetEntityId = isTextContainingEntityProperties(
                    blockEntity.properties.entity.properties,
                  )
                    ? blockEntity.properties.entity.properties.text.data
                        .entityId
                    : blockEntity.properties.entity.entityId;
                  break;

                default:
                  throw new Error("unexpected structure");
              }

              const entity = store.store.draft[node.attrs.draftId];

              if (!entity) {
                throw new Error(
                  `Cannot find corresponding draft entity for node post-save`,
                );
              }

              if (targetEntityId !== entity.entityId) {
                actions.push({
                  type: "updateEntityId",
                  payload: {
                    draftId: entity.draftId,
                    entityId: targetEntityId,
                  },
                });
              }
            }
          });

          if (actions.length) {
            await this.addEvents(apolloClient)(
              this.version,
              [],
              `${clientID}-server`,
              actions,
              false,
            );
          }

          this.updateSavedContents(newPage.properties.contents);
        });
      })
      .catch((err) => {
        this.error(err);
      });
  };

  addJsonEvents =
    (apolloClient: ApolloClient<unknown>) =>
    async (
      version: number,
      jsonSteps: any[],
      clientId: string,
      blockIds: string[],
      actions: EntityStorePluginAction[] = [],
    ) => {
      try {
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

        const res = this.addEvents(apolloClient)(
          version,
          steps,
          clientId,
          actions,
        );

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
      } catch (err) {
        this.error(err);
        return false;
      }
    };

  /**
   * Subscribe to document changes.
   * Each subscriber is uniquely identified by an opaque ID
   *
   * @returns unqiue identifier used to remove subscription if instance hasn't errored
   */
  subscribeDocument(params: Omit<DocumentChangeSubscription, "identifier">) {
    if (this.errored) {
      return;
    }

    const sub = { ...params, identifier: genId() };
    this.subscriptions.push(sub);

    return sub.identifier;
  }

  /**
   * Unsubscribe from changes to the document
   */
  unsubscribeDocument(identifier: DocumentChangeSubscription["identifier"]) {
    this.subscriptions = this.subscriptions.filter(
      (sub) => sub.identifier !== identifier,
    );
  }

  private sendUpdates(updates: Update[]) {
    const documentChange = updatesToDocumentUpdate(updates, this.clientIds);

    // Race condition here.
    // if a new user were to join as this mapping was happening,
    // they wouldn't be added as a subscriber.
    this.subscriptions = this.subscriptions.filter((sub) => {
      // If the Subscription for whatever reason fails, remove it as a subscriber.
      try {
        sub.notify(documentChange);
      } catch (_err) {
        // eslint-disable-next-line no-param-reassign
        sub.persistent = false;
      }

      // Only keep persistent document subscriptions
      return sub.persistent;
    });
  }

  // : (Number)
  // Check if a document version number relates to an existing
  // document version.
  private checkVersion(version: number) {
    if (version < 0 || version > this.version) {
      throw new InvalidVersionError(version);
    }
  }

  /**
   * Get events between a given document version and the current document
   * version.
   */
  getEvents(
    version: number,
  ): (DocumentChange & { shouldRespondImmediately: boolean }) | false {
    try {
      if (this.errored) {
        return false;
      }

      this.checkVersion(version);
      const startIndex = this.updates.length - (this.version - version);
      if (startIndex < 0) return false;

      const updates = this.updates.slice(startIndex);
      const result = updatesToDocumentUpdate(updates, this.clientIds);
      return { ...result, shouldRespondImmediately: updates.length > 0 };
    } catch (err) {
      this.error(err);
      return false;
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
    if (this.errored) {
      return;
    }

    const currentTimestamp = Date.now();

    const timedPositionIndex = this.timedPositions.findIndex(
      (timedPosition) => timedPosition.userId === userId,
    );

    if (timedPositionIndex !== -1) {
      if (entityId) {
        const existingPosition = this.timedPositions[timedPositionIndex]!;
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

    this.notifyPositionSubs();
  }

  private cleanupPositions() {
    const previousNumberOfPositions = this.timedPositions.length;
    const currentTimestamp = Date.now();

    this.timedPositions = this.timedPositions.filter(
      ({ reportedAt }) =>
        reportedAt + POSITION_EXPIRY_TIMEOUT >= currentTimestamp,
    );

    if (this.timedPositions.length !== previousNumberOfPositions) {
      this.notifyPositionSubs();
    }
  }

  /**
   * Subscribe to position changes.
   * Each subscriber is uniquely identified by an opaque ID
   *
   * @returns unqiue identifier used to remove subscription if instance hasn't errored
   */
  subscribePosition(params: Omit<CollabPositionSubscription, "identifier">) {
    if (this.errored) {
      return;
    }

    const sub = { ...params, identifier: genId() };
    this.positionSubscription.push(sub);

    return sub.identifier;
  }

  /**
   * Unsubscribe from changes to the document
   */
  unsubscribePosition(identifier: CollabPositionSubscription["identifier"]) {
    this.positionSubscription = this.positionSubscription.filter(
      (sub) => sub.identifier !== identifier,
    );
  }

  private notifyPositionSubs() {
    this.positionSubscription.forEach((sub) => {
      const { baselinePositions, userIdToExclude, notify } = sub;

      const positions = this.extractPositions(userIdToExclude);

      if (!isEqual(baselinePositions, positions)) {
        notify(positions);
      }
    });

    setImmediate(() => {
      this.cleanupPositionSubs();
    });
  }

  private cleanupPositionSubs() {
    // It is assumed that every non-persistent subscription
    // can be cleaned up when this is called.
    this.positionSubscription = this.positionSubscription.filter(
      (sub) => sub.persistent,
    );
  }

  /**
   * @todo do we want to force sending updates here too?
   */
  private addUpdates(updates: Update[]) {
    if (this.errored) {
      return;
    }

    this.updates = [...this.updates, ...updates];

    /**
     * @todo this needs to be synced with the collab plugin on the frontend
     *       which is based on steps, so it's not as simple as this
     */
    this.version += updates.length;

    if (this.updates.length > MAX_STEP_HISTORY) {
      this.updates = this.updates.slice(this.updates.length - MAX_STEP_HISTORY);
    }

    this.sendUpdates(updates);
  }
}

const instances: Record<string, Instance> = Object.create(null);
let instanceCount = 0;
const maxCount = 20;

const newInstance =
  (apolloClient: ApolloClient<unknown>, entityWatcher: EntityWatcher) =>
  async (accountId: string, pageEntityId: string): Promise<Instance> => {
    if (++instanceCount > maxCount) {
      let oldest = null;
      for (const instanceId of Object.keys(instances)) {
        const inst = instances[instanceId]!;
        if (!oldest || inst.lastActive < oldest.lastActive) oldest = inst;
      }
      if (oldest) {
        instances[oldest.pageEntityId]!.stop();
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

    const state = createProseMirrorState({ accountId });

    const manager = new ProsemirrorSchemaManager(state.schema, accountId);

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
      return instances[pageEntityId]!;
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

    return instances[pageEntityId]!;
  };

export const getInstance =
  (apolloClient: ApolloClient<unknown>, entityWatcher: EntityWatcher) =>
  async (accountId: string, pageEntityId: string, forceNewInstance = false) => {
    if (forceNewInstance || instances[pageEntityId]?.errored) {
      instances[pageEntityId]?.stop();
      delete instances[pageEntityId];
    }
    const inst =
      instances[pageEntityId] ||
      (await newInstance(apolloClient, entityWatcher)(accountId, pageEntityId));
    inst.lastActive = Date.now();
    return inst;
  };
