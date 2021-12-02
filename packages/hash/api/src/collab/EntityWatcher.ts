import { EntityVersion } from "@hashintel/hash-backend-utils/pgTables";
import { QueueExclusiveConsumer } from "@hashintel/hash-backend-utils/queue/adapter";
import { Wal2JsonMsg } from "@hashintel/hash-backend-utils/wal2json";
import { logger } from "../logger";
import { COLLAB_QUEUE_NAME } from "./util";

type EntityWatcherSubscription = (entity: EntityVersion) => Promise<unknown>;

export class EntityWatcher {
  private started = false;
  private subscriptions = new Set<EntityWatcherSubscription>();

  constructor(private queue: QueueExclusiveConsumer) {}

  subscribe(subscriber: EntityWatcherSubscription) {
    this.subscriptions.add(subscriber);

    return () => {
      this.subscriptions.delete(subscriber);
    };
  }

  async start() {
    this.started = true;
    while (this.started) {
      await this.processNextQueueMsg(1000);
    }
  }

  stop() {
    this.started = false;
  }

  private async processNextQueueMsg(timeout: number) {
    await this.queue.pop(COLLAB_QUEUE_NAME, timeout, async (item: string) => {
      const wal2jsonMsg = JSON.parse(item) as Wal2JsonMsg;
      await this.processMessage(wal2jsonMsg);
      return true;
    });
  }

  private async processMessage(msg: Wal2JsonMsg) {
    if (msg.table !== "entity_versions") {
      return;
    }

    /**
     * We do need to in theory handle what happens if an entity is deleted, but
     * that's for another day…
     *
     * @todo address this
     */
    if (msg.action !== "D") {
      const entityVersion = EntityVersion.parseWal2JsonMsg(msg);

      for (const subscriber of this.subscriptions) {
        try {
          await subscriber(entityVersion);
        } catch (err) {
          logger.error("Error in notifying of entity change", err);
        }
      }
    }
  }
}
