import { JsonObject } from "@blockprotocol/core/.";

import { Logger } from "../logger";
import { RedisClient } from "../redis";
import { StreamConsumer, StreamProducer } from "./adapter";

/**
 * An implementation of the `StreamProducer` interface based on Redis streams.
 */
export class RedisStreamProducer<StreamName extends string>
  implements StreamProducer<StreamName>
{
  constructor(private client: RedisClient, private streamName: StreamName) {}

  /**
   * Add payload to the stream
   * @param payload The JSON payload to add to the stream
   * @param id The ID of the payload. If not specified, a random ID will be generated.
   */
  async push<T>(payload: T, id: string = "*"): Promise<void> {
    await this.client.xadd(this.streamName, id, JSON.stringify(payload));
  }
}

/**
 * An implementation of the `StreamConsumer` interface based on Redis streams.
 */
export class RedisStreamConsumer<StreamName extends string>
  implements StreamConsumer<StreamName>
{
  private lastId: string | null = null;

  constructor(
    private logger: Logger,
    private client: RedisClient,
    private streamName: StreamName,
  ) {}

  async readNext(): Promise<JsonObject[]> {
    const msg = await this.client.xread(
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
