// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
/**
 * @todo remove above ts-nocheck as we start re-enabling collab
 *   https://app.asana.com/0/1202805690238892/1202924026802709/f
 */
import { ApolloClient } from "@apollo/client";
import {
  AggregationVersion,
  LinkVersion,
} from "@hashintel/hash-backend-utils/pgTables";
import { RealtimeMessage } from "@hashintel/hash-backend-utils/realtime";
import { CollabPosition } from "@hashintel/hash-shared/collab";
import { createProseMirrorState } from "@hashintel/hash-shared/createProseMirrorState";
import { BlockEntity, flatMapBlocks } from "@hashintel/hash-shared/entity";
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
  GetLinkedAggregationQuery,
  GetLinkedAggregationQueryVariables,
  GetLinkQuery,
  GetLinkQueryVariables,
  GetPersistedPageQuery,
  GetPersistedPageQueryVariables,
  LatestEntityRef,
} from "@hashintel/hash-shared/graphql/apiTypes.gen";
import { getPersistedPageQuery } from "@hashintel/hash-shared/queries/page.queries";
import { save } from "@hashintel/hash-shared/save";

import { ProsemirrorManager } from "@hashintel/hash-shared/ProsemirrorManager";
import {
  getLinkedAggregationIdentifierFieldsQuery,
  getLinkQuery,
} from "@hashintel/hash-shared/queries/link.queries";
import { Response } from "express";
import { isEqual, memoize, pick } from "lodash";
import { Schema } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { Step } from "prosemirror-transform";
import { getBlocksQuery } from "./graphql/queries/blocks.queries";
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
  payload: { store: EntityStore; version: number };
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
    public state: EditorState,
    public manager: ProsemirrorManager,
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
      (message) => this.processWatcherMessage(message),
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
      logger.error(
        "Error encountered when instance already in errored state",
        err,
      );
      return;
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
  private async processWatcherMessage({ table, record }: RealtimeMessage) {
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

      /**
       * This fetches entity references relevant to the provided LinkVersion or AggregationVersion.
       * Multiple entity refs may be returned, as a LinkVersion has both a source and a destination.
       * The LinkedEntities for a destination can change if any of its properties are resolved via incoming links.
       * This uses {@link getEntityRef} to memoize the refs, so they can be checked against refs
       * acquired through that function directly.
       */
      const getEntityRefsFromLinkOrAggregation = (
        recordToGetIdsFrom: LinkVersion | AggregationVersion,
      ): Promise<LatestEntityRef[]> => {
        const variables =
          "linkId" in recordToGetIdsFrom
            ? {
                sourceAccountId: recordToGetIdsFrom.sourceAccountId,
                linkId: recordToGetIdsFrom.linkId,
              }
            : {
                sourceAccountId: recordToGetIdsFrom.sourceAccountId,
                aggregationId: recordToGetIdsFrom.aggregationId,
              };
        return this.fallbackClient
          .query<
            GetLinkQuery | GetLinkedAggregationQuery,
            GetLinkQueryVariables | GetLinkedAggregationQueryVariables
          >({
            query:
              "linkId" in recordToGetIdsFrom
                ? getLinkQuery
                : getLinkedAggregationIdentifierFieldsQuery,
            variables,
            fetchPolicy: "network-only",
          })
          .then(({ data }) => {
            if ("getLink" in data) {
              const {
                sourceAccountId,
                sourceEntityId,
                destinationAccountId,
                destinationEntityId,
              } = data.getLink;
              return [
                getEntityRef({
                  accountId: sourceAccountId,
                  entityId: sourceEntityId,
                }),
                getEntityRef({
                  accountId: destinationAccountId,
                  entityId: destinationEntityId,
                }),
              ];
            } else {
              const { sourceAccountId, sourceEntityId } =
                data.getLinkedAggregation;
              return [
                getEntityRef({
                  accountId: sourceAccountId,
                  entityId: sourceEntityId,
                }),
              ];
            }
          });
      };

      const recordUpdatedAt = new Date(record.updatedAt).getTime();

      const affectedEntityRefs: LatestEntityRef[] =
        table === "entity_versions"
          ? [getEntityRef(record)] // an entity itself has been updated - get its ref
          : await getEntityRefsFromLinkOrAggregation(record); // a link or linked aggregation has been updated - get the affected entities

      /**
       * Determine which blocks to refresh by checking if any of the entities within it are affected
       */
      const blocksToRefresh = new Set(
        flatMapBlocks(this.savedContents, (entity, blockEntity) => {
          const entityRef = getEntityRef(entity);

          // check if the entity itself is affected
          let affected = affectedEntityRefs.includes(entityRef);

          if (!affected && "linkedEntities" in entity) {
            // this is the entity within the block, i.e. the 'child' entity
            // check if any of its linked entities or linked aggregations are affected
            // we don't need to check this if we already know it's affected
            affected =
              entity.linkedEntities.some((linkedEntity) =>
                affectedEntityRefs.includes(getEntityRef(linkedEntity)),
              ) ||
              entity.linkedAggregations.some(
                ({ sourceAccountId, sourceEntityId }) =>
                  affectedEntityRefs.includes(
                    getEntityRef({
                      accountId: sourceAccountId,
                      entityId: sourceEntityId,
                    }),
                  ),
              );
          }

          if (
            affected &&
            recordUpdatedAt > new Date(entity.updatedAt).getTime()
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

  private updateSavedContents(
    blocks: BlockEntity[],
    draftToEntity: Record<string, string> = {},
  ) {
    if (this.errored) {
      return;
    }

    this.sendUpdates();
    const { tr } = this.state;
    addEntityStoreAction(this.state, tr, {
      type: "mergeNewPageContents",
      payload: {
        blocks,
        presetDraftIds: draftToEntity,
      },
    });
    this.state = this.state.apply(tr);
    this.savedContents = blocks;
    /**
     * @todo remove this – we should be able to send the tracked actions to other
     *       clients, instead of the whole store
     */
    this.addUpdates([
      {
        type: "store",
        payload: {
          store: entityStorePluginState(this.state).store,
          version: this.version + 1,
        },
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
        if (this.version !== version) {
          return false;
        }

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

        if (apolloClient && steps.length + actions.length > 0) {
          // @todo offload saves to a separate process / debounce them
          this.save(apolloClient)();
        }
      } catch (err) {
        this.error(err);
        return false;
      }

      return { version: this.version };
    };

  save = (apolloClient: ApolloClient<unknown>) => () => {
    this.saveChain = this.saveChain
      .catch()
      .then(async () => {
        if (this.errored) {
          throw new Error("Saving when instance stopped");
        }

        const [nextBlocks, draftToEntity] = await save(
          apolloClient,
          this.accountId,
          this.pageEntityId,
          this.state.doc,
          entityStorePluginState(this.state).store,
        );

        this.updateSavedContents(nextBlocks, draftToEntity);
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
         * @todo implement block caching layer
         * @see https://app.asana.com/0/1201095311341924/1202707274604481/f
         */
        await this.manager.ensureBlocksDefined(blockIds);

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

  private sendUpdates() {
    while (this.waiting.length) {
      this.waiting.pop()?.finish();
    }
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
  getEvents(version: number) {
    try {
      if (this.errored) {
        return false;
      }

      this.checkVersion(version);
      const startIndex = this.updates.length - (this.version - version);
      if (startIndex < 0) {
        return false;
      }

      let updates = this.updates.slice(startIndex);

      const storeUpdateIndex = updates.findIndex(
        (update) => update.type === "store",
      );

      let storeUpdate: StoreUpdate | null = null;

      /**
       * As store actions are separated from others right now, the client doesn't
       * know the order. If collab wasn't being rebuilt, I'd restructure this
       * to create a single stream of updates. But because it is, it's easier
       * to just separate store messages from all others by not sending a
       * store update alongside other updates
       */
      if (storeUpdateIndex > -1) {
        if (storeUpdateIndex === 0) {
          if (updates.every((update) => update.type === "store")) {
            storeUpdate = updates[updates.length - 1] as StoreUpdate;
          } else {
            storeUpdate = updates[0] as StoreUpdate;
          }

          updates = [];
        } else {
          updates = updates.slice(0, storeUpdateIndex);
        }
      }

      const steps = updates
        .filter((update): update is StepUpdate => update.type === "step")
        .map((update) => update.payload);

      const actions = updates
        .filter((update): update is ActionUpdate => update.type === "action")
        .map((update) => update.payload);

      return {
        steps,
        clientIDs: steps.map((step) => this.clientIds.get(step)),
        store: storeUpdate?.payload.store,
        actions,
        shouldRespondImmediately: updates.length > 0 || storeUpdate,
        nextVersion: storeUpdate?.payload.version,
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

  private cleanupPositions() {
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

  private notifyPositionPollers() {
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

  private cleanupPositionPollers() {
    this.positionPollers = this.positionPollers.filter(({ response }) =>
      isUnused(response),
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
        if (!oldest || inst.lastActive < oldest.lastActive) {
          oldest = inst;
        }
      }
      if (oldest) {
        instances[oldest.pageEntityId]!.stop();
        delete instances[oldest.pageEntityId];
        --instanceCount;
      }
    }

    const { data } = await apolloClient.query<
      GetPersistedPageQuery,
      GetPersistedPageQueryVariables
    >({
      query: getPersistedPageQuery,
      variables: { ownedById: accountId, entityId: pageEntityId },
    });

    const state = createProseMirrorState({ accountId });

    const manager = new ProsemirrorManager(state.schema, accountId);

    /**
     * @todo check plugins
     */
    const newState = state.apply(
      await manager.loadPage(state, data.persistedPage.contents),
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
      data.persistedPage.contents,
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
      instanceCount--;
    }
    const inst =
      instances[pageEntityId] ??
      (await newInstance(apolloClient, entityWatcher)(accountId, pageEntityId));
    inst.lastActive = Date.now();
    return inst;
  };
