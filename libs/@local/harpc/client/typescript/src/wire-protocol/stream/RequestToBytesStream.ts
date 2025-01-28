import { Effect, pipe, Stream } from "effect";

import { Request } from "../models/request/index.js";
import { MutableBuffer } from "../../binary/index.js";

export const make = <E, R>(
  stream: Stream.Stream<Request.Request, E, R>,
): Stream.Stream<ArrayBuffer, E | Request.EncodeError, R> =>
  pipe(
    stream,
    Stream.mapEffect((request) =>
      Effect.gen(function* () {
        const buffer = MutableBuffer.makeWrite();

        yield* Request.encode(buffer, request);

        return MutableBuffer.take(buffer);
      }),
    ),
  );
