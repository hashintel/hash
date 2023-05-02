import { JsonObject } from "@blockprotocol/core/.";

import { Logger } from "../logger";
import { RedisClient } from "../redis";
import { StreamConsumer, StreamProducer } from "./adapter";

/** @todo consider if we want to use msgpack or something instead of JSON */

/**
 * An implementation of the `StreamProducer` interface based on Redis streams.
 */
export class RedisStreamProducer<T> implements StreamProducer<T> {
  constructor(
    private _logger: Logger,
    private client: RedisClient,
    private streamName: string,
  ) {}

  /**
   * Add payload to the stream
   * @param payload The JSON payload to add to the stream
   * @param id The ID of the payload. If not specified, a random ID will be generated.
   */
  async push(
    payload: T,
    id: string = "*",
    maxStreamLength: number = 4096,
  ): Promise<void> {
    await this.client.xadd(
      this.streamName,
      "MAXLEN",
      maxStreamLength,
      id,
      "payload",
      JSON.stringify(payload),
    );
  }
}

/**
 * An implementation of the `StreamConsumer` interface based on Redis streams.
 */
export class RedisStreamConsumer implements StreamConsumer {
  private lastId: string | null = null;

  constructor(
    private logger: Logger,
    private client: RedisClient,
    private streamName: string,
  ) {}

  async readNext(maxReadCount: number = 100): Promise<JsonObject[]> {
    const msg = await this.client.xread(
      "COUNT",
      maxReadCount,
      "BLOCK",
      0,
      "STREAMS",
      this.streamName,
      this.lastId === null ? "$" : this.lastId,
    );

    // Reduce all messages from the specific stream of this class into a list,
    // dropping their key names, saving the last stream entry id.
    const msgs = msg?.reduce<{
      lastEntryId: string;
      payloads: JsonObject[];
    } | null>((acc, [stream, messages]) => {
      if (stream === this.streamName) {
        // eslint-disable-next-line no-param-reassign
        acc = acc ?? { lastEntryId: "", payloads: [] };
        for (const [id, [_, payload]] of messages) {
          if (payload) {
            acc.payloads.push(JSON.parse(payload) as JsonObject);
            acc.lastEntryId = id;
          } else {
            this.logger.debug(
              "Received unknown stream entry in payload: ",
              messages,
            );
          }
        }
      }
      return acc;
    }, null);

    this.lastId = msgs?.lastEntryId ?? this.lastId;

    return msgs?.payloads ?? [];
  }
}
