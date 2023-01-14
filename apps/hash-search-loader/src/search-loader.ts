// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
/**
 * @todo remove above ts-nocheck as we start re-enabling OpenSearch indexing
 *   https://app.asana.com/0/1200211978612931/1202938382575963/f
 */
import { DbAdapter } from "@hashintel/hash-api/src/db";
import { EntityType as DbEntityType } from "@hashintel/hash-api/src/db/adapter";
import { Entity, EntityType, Page } from "@hashintel/hash-api/src/model";
import { EntityVersion } from "@local/hash-backend-utils/pg-tables";
import { QueueExclusiveConsumer } from "@local/hash-backend-utils/queue/adapter";
import { SearchAdapter } from "@local/hash-backend-utils/search/adapter";
import {
  ENTITIES_SEARCH_FIELD,
  EntitiesDocument,
} from "@local/hash-backend-utils/search/doc-types";
import { Wal2JsonMsg } from "@local/hash-backend-utils/wal2json";
import { TextToken } from "@local/hash-shared/graphql/types";
import { sleep } from "@local/hash-shared/sleep";
import { StatsD } from "hot-shots";

import { logger } from "./config";

export type SearchLoaderConfig = {
  db: DbAdapter;
  queueConsumer: QueueExclusiveConsumer;
  search: SearchAdapter;
  searchEntititesIndex: string;
  searchQueueName: string;
  statsd?: StatsD;
  systemAccountId: string;
};

/** Convert a Text entities properties to a string which may be indexed for the
 * purposes of full-text-search.
 * @todo: This is a temporary solution. The conversion should be handled at the level of
 * the entity of the type are created?
 *
 * Example:
 *   {"tokens": [{"type": "text", "text": "Hello World!", "underline": true}, {"type": "text", "text": "Welcome to HASH!"}]}
 *
 * Returns:
 *  "Hello World! Welcome to HASH!"
 */
const textEntityPropertiesToFTS = (properties: {
  tokens: TextToken[];
}): string => {
  return properties.tokens
    .map((token) => {
      switch (token.tokenType) {
        case "text":
          return token.text;
        case "hardBreak":
          return "\n";
        default:
          return " ";
      }
    })
    .join(" ");
};

export class SearchLoader {
  private stopRequested = false;
  private isStopped = false;
  private db: DbAdapter;
  private queueConsumer: QueueExclusiveConsumer;
  private search: SearchAdapter;
  private readonly searchEntititesIndex: string;
  private readonly searchQueueName: string;
  private statsd?: StatsD;
  private readonly systemAccountId: string;

  /** The `SearchLoader` is responsible for consuming items from the redis queue
   * and loading the data into the search service. */
  constructor({
    db,
    queueConsumer,
    search,
    searchEntititesIndex,
    searchQueueName,
    statsd,
    systemAccountId,
  }: SearchLoaderConfig) {
    this.db = db;
    this.queueConsumer = queueConsumer;
    this.search = search;
    this.searchEntititesIndex = searchEntititesIndex;
    this.searchQueueName = searchQueueName;
    this.statsd = statsd;
    this.systemAccountId = systemAccountId;
  }

  private _pageEntitySystemType: DbEntityType | null = null;
  async pageEntitySystemType() {
    if (!this._pageEntitySystemType) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      this._pageEntitySystemType = await Page.getEntityType(this.db);
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this._pageEntitySystemType;
  }

  /** Start the loader process which reads messages from the ingestion queue and
   * loads each into the search service.
   */
  async start(): Promise<void> {
    logger.debug("Search loader started");
    this.stopRequested = false;
    this.isStopped = false;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- false-positive (because of await)
    while (!this.stopRequested) {
      await this.processNextQueueMsg(1000);
    }
    this.isStopped = true;
  }

  /** Process the next item on the queue, or return early if the queue is empty for
   * longer than `timeout` milliseconds. */
  private async processNextQueueMsg(timeout: number): Promise<void> {
    const processed = await this.queueConsumer.pop(
      this.searchQueueName,
      timeout,
      async (item: string) => {
        const wal2jsonMsg = JSON.parse(item) as Wal2JsonMsg;
        await this.loadMsgIntoSearchIndex(wal2jsonMsg);
        logger.debug(item);
        return true;
      },
    );
    if (processed) {
      this.statsd?.increment("messages_processed");
    }
  }

  /** Load a message into the search index. */
  private async loadMsgIntoSearchIndex(wal2jsonMsg: Wal2JsonMsg) {
    const table = wal2jsonMsg.table;
    if (table === "entity_versions") {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- this code is broken, EntityVersion is not exported from @local/hash-backend-utils/pg-tables
      const entity = EntityVersion.parseWal2JsonMsg(wal2jsonMsg);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- this code is broken, EntityType is not exported from @local/hash-backend-utils/pg-tables
      const entityType = await EntityType.getEntityType(this.db, {
        entityTypeVersionId: entity.entityTypeVersionId,
      });

      if (!entityType) {
        logger.error(
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `Could not find entity type with entityTypeVersionId "${entity.entityTypeVersionId}"`,
        );
        return;
      }

      const indexedEntity: EntitiesDocument = {
        accountId: entity.accountId,
        entityId: entity.entityId,
        entityVersionId: entity.entityVersionId,
        entityTypeId: entityType.entityId,
        entityTypeVersionId: entity.entityTypeVersionId,
        entityTypeName: entityType.metadata.name,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- @todo investigate
        updatedAt: entity.updatedAt.toISOString(),
        updatedByAccountId: entity.updatedByAccountId,
      };
      // @todo: could move the `SYSTEM_TYPES` definition from the backend to backend-utils
      // and use it here rather than checking the string value of the entity type name.
      if (
        entityType.accountId === this.systemAccountId &&
        entityType.metadata.name === "Text"
      ) {
        indexedEntity[ENTITIES_SEARCH_FIELD] = textEntityPropertiesToFTS(
          entity.properties as { tokens: TextToken[] },
        );
        // @todo this should be done through a model class instead of explicitly through the DB adapter.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        const grandparents = await this.db.getAncestorReferences({
          accountId: entity.accountId,
          entityId: entity.entityId,
          depth: 2,
        });
        // @todo: Do we handle text blocks that have multiple grandparent pages?
        if (grandparents.length === 1) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- this code is broken, Entity is not exported from @local/hash-backend-utils/pg-tables
          const grandparentLatestEntity = await Entity.getEntityLatestVersion(
            this.db,
            {
              ...grandparents[0]!,
            },
          );

          if (
            grandparentLatestEntity &&
            grandparentLatestEntity.entityType.entityId ===
              (await this.pageEntitySystemType()).entityId
          ) {
            indexedEntity.belongsToPage = {
              entityId: grandparentLatestEntity.entityId,
              entityVersionId: grandparentLatestEntity.entityVersionId,
              accountId: grandparentLatestEntity.accountId,
            };
          }
        }
      } else if (
        entityType.accountId === this.systemAccountId &&
        entityType.metadata.name === "Page"
      ) {
        indexedEntity[ENTITIES_SEARCH_FIELD] = entity.properties.title;
      } else {
        // @todo: we're only considering Text and Page entities for full text search at
        // the moment. Return here when we figure out how to deal with text search on
        // arbitrary entities. For now, just do FTS on the JSON.stringified properties
      }

      await this.search.index({
        index: this.searchEntititesIndex,
        id: indexedEntity.entityId,
        body: indexedEntity,
      });
    } else {
      throw new Error(`unexpected change message from table "${table}"`);
    }
  }

  /** Stop the loader process gracefully. */
  async stop() {
    this.stopRequested = true;
    for (let i = 0; i < 10; i++) {
      if (this.isStopped) {
        return;
      }
      await sleep(1000);
    }
    throw new Error("could not stop `SearchLoader` instance.");
  }
}
