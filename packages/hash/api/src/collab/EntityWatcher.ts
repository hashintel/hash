import { EntityVersion } from "@hashintel/hash-backend-utils/pgTables";
import { RedisQueueExclusiveConsumer } from "@hashintel/hash-backend-utils/queue/redis";
import { Wal2JsonMsg } from "@hashintel/hash-backend-utils/wal2json";
import { COLLAB_QUEUE_NAME } from "./util";

export class EntityWatcher {
  private subscriptions: ((entity: EntityVersion) => void)[] = [];

  constructor(private queue: RedisQueueExclusiveConsumer) {}

  subscribe(subscriber: (entity: EntityVersion) => void) {
    this.subscriptions.push(subscriber);

    return () => {
      this.subscriptions.splice(this.subscriptions.indexOf(subscriber), 1);
    };
  }

  async start() {
    while (true) {
      await this.processNextQueueMsg(1000);
    }
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
          console.error("Error in notifying of entity change", err);
        }
      }
    }
  }
}
