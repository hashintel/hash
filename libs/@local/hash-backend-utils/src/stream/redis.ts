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

const redisChunkRead = async <T>(params: {
  logger: Logger;
  client: RedisClient;
  streamName: string;
  lastReadId: string | null;
  maxReadCount: number;
}): Promise<{
  lastReadId: string | null;
  payloads: T[];
}> => {
  const { logger, client, streamName, lastReadId, maxReadCount } = params;
  const msg =
    (await client.xread(
      "COUNT",
      maxReadCount,
      "BLOCK",
      0,
      "STREAMS",
      streamName,
      lastReadId === null ? "$" : lastReadId,
    )) ?? [];

  // Reduce all messages from the specific stream of this class into a list,
  // dropping their key names, saving the last stream entry id.
  return msg.reduce<{
    lastReadId: string | null;
    payloads: T[];
  }>(
    (acc, [stream, messages]) => {
      if (stream === streamName) {
        for (const [id, [_, payload]] of messages) {
          if (payload) {
            acc.payloads.push(JSON.parse(payload) as T);
            acc.lastReadId = id;
          } else {
            logger.debug(
              "Received unknown stream entry in payload: ",
              messages,
            );
          }
        }
      }
      return acc;
    },
    { lastReadId, payloads: [] },
  );
};

/**
 * An implementation of the `StreamConsumer` interface based on Redis streams.
 */
export class RedisStreamConsumer<T> implements StreamConsumer<T> {
  private lastId: string | null = null;
  private running: boolean = true;

  constructor(
    private logger: Logger,
    private client: RedisClient,
    private streamName: string,
  ) {}

  async *[Symbol.asyncIterator](maxReadCount: number = 100): AsyncGenerator<T> {
    while (this.running) {
      const result = await redisChunkRead<T>({
        logger: this.logger,
        client: this.client,
        streamName: this.streamName,
        lastReadId: this.lastId,
        maxReadCount,
      });

      this.lastId = result.lastReadId ?? this.lastId;

      for (const payload of result.payloads) {
        yield payload;
      }
    }
  }

  async handleEvery(handler: (value: T) => Promise<void>) {
    for await (const value of this) {
      await handler(value);
    }
  }
}
