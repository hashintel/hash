import { Effect, pipe, Stream, Streamable } from "effect";

import * as Buffer from "../Buffer.js";
import { Request } from "../models/request/index.js";

export class RequestToBytesStream<E, R> extends Streamable.Class<
  ArrayBuffer,
  E | Request.EncodeError,
  R
> {
  readonly #stream: Stream.Stream<Request.Request, E, R>;

  constructor(stream: Stream.Stream<Request.Request, E, R>) {
    super();

    this.#stream = stream;
  }

  toStream(): Stream.Stream<ArrayBuffer, E | Request.EncodeError, R> {
    return pipe(
      this.#stream,
      Stream.mapEffect((request) =>
        Effect.gen(function* () {
          const buffer = yield* Buffer.makeWrite();

          yield* Request.encode(buffer, request);

          return yield* Buffer.take(buffer);
        }),
      ),
    );
  }
}

export const make = <E, R>(stream: Stream.Stream<Request.Request, E, R>) =>
  new RequestToBytesStream(stream);
