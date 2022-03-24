import { ApolloClient } from "@apollo/client";
import { EntityVersion } from "@hashintel/hash-backend-utils/pgTables";
import { CollabPosition } from "@hashintel/hash-shared/collab";
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
import { Response } from "express";
import { isEqual, memoize, pick } from "lodash";
import { Schema } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { Step } from "prosemirror-transform";
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

type ActionUpdate = {
  type: "action";
  payload: EntityStorePluginAction;
};

type Update = StepUpdate | StoreUpdate | ActionUpdate;

// A collaborative editing document instance.
export class Instance {
  // The version number of the document instance.
  version = 0;
  lastActive = Date.now();
  waiting: Waiting[] = [];
  saveChain = Promise.resolve();
  clientIds = new WeakMap<Step, string>();

  positionPollers: CollabPositionPoller[] = [];
  timedPositions: TimedCollabPosition[] = [];
  positionCleanupInterval: ReturnType<typeof setInterval>;

  errored = false;
  stopped = false;

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
    if (this.stopped) {
      return;
    }

    this.stopped = true;
    this.sendUpdates();

    clearInterval(this.positionCleanupInterval);

    for (const { response } of this.positionPollers) {
      if (isUnused(response)) {
        response.status(410).send("Collab instance was stopped");
      }
    }
    this.unsubscribeFromEntityWatcher();
  }

  error(err: unknown) {
    if (err instanceof InvalidVersionError) {
      throw err;
    }

    if (this.errored) {
      logger.warn(
        "Error encountered when instance already in errored state",
        err,
      );
      return false;
    }

    logger.warn(
      `Stopping instance ${this.accountId}/${this.pageEntityId}`,
      err,
    );

    this.errored = true;
    this.updates = [];
    this.sendUpdates();
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
      return false;
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
    this.sendUpdates();
  }

  addEvents =
    (apolloClient?: ApolloClient<unknown>) =>
    (
      version: number,
      steps: Step[],
      clientID: string,
      actions: EntityStorePluginAction[] = [],
      fromClient = true,
    ) => {
      if (this.errored) {
        return false;
      }

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
            logger.warn("Bad step", steps[i]);
            throw new Error("Could not apply step");
          }
        }

        for (const action of actions) {
          addEntityStoreAction(this.state, tr, { ...action, received: true });
        }

        this.state = this.state.apply(tr);

        this.addUpdates(steps.map((step) => ({ type: "step", payload: step })));

        for (const action of actions) {
          this.addUpdates([{ type: "action", payload: action }]);
        }

        this.sendUpdates();

        if (apolloClient) {
          // @todo offload saves to a separate process / debounce them
          this.save(apolloClient)(clientID);
        }
      } catch (err) {
        this.error(err);
        return false;
      }

      return { version: this.version };
    };

  save = (apolloClient: ApolloClient<unknown>) => (clientID: string) => {
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
          this.addEvents(apolloClient)(
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
        ).then((newPage) => {
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
            this.addEvents(apolloClient)(
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
    try {
      if (this.errored) {
        return false;
      }

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

      const actions = updates
        .filter((update): update is ActionUpdate => update.type === "action")
        .map((update) => update.payload);

      return {
        steps,
        clientIDs: steps.map((step) => this.clientIds.get(step)),
        store,
        actions,
        shouldRespondImmediately: updates.length > 0,
      };
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
    if (this.errored) {
      return;
    }

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
    if (this.errored) {
      return false;
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
    if (forceNewInstance) {
      instances[pageEntityId]?.stop();
      delete instances[pageEntityId];
    }
    const inst =
      instances[pageEntityId] ||
      (await newInstance(apolloClient, entityWatcher)(accountId, pageEntityId));
    inst.lastActive = Date.now();
    return inst;
  };
