import { Effect, pipe, Stream } from "effect";

import * as Buffer from "../Buffer.js";
import { Request } from "../models/request/index.js";

export const make = <E, R>(
  stream: Stream.Stream<Request.Request, E, R>,
): Stream.Stream<ArrayBuffer, E | Request.EncodeError, R> =>
  pipe(
    stream,
    Stream.mapEffect((request) =>
      Effect.gen(function* () {
        const buffer = yield* Buffer.makeWrite();

        yield* Request.encode(buffer, request);

        return yield* Buffer.take(buffer);
      }),
    ),
  );
