import { Cause, Data, Effect, Match } from "effect";
import * as S from "@effect/schema/Schema";

import { PayloadSize, TransportVersion } from "./common";
import { Reader } from "./reader";
import { TRANSPORT_VERSION } from "./index";

export class UnknownResponseError extends Data.TaggedError("UnknownResponse") {}

export class UnsupportedTransportVersionError extends Data.TaggedError(
  "UnsupportedTransportVersion",
) {}

enum ResponseError {
  DeadlineExceeded,
  ConnectionClosed,
  UnknownServiceVersion,
  UnknownService,
  UnknownProcedure,
  InvalidTransportVersion,
  InvalidPayloadSize,
  InvalidPayload,
  EncodingError,
  DecodingError,
}

function responseErrorFromErrorCode(
  value: number,
): Effect.Effect<
  never,
  Cause.NoSuchElementException | UnknownResponseError,
  ResponseError
> {
  return Match.value(value)
    .pipe(
      Match.when(0, () => ResponseError.DeadlineExceeded),
      Match.when(1, () => ResponseError.ConnectionClosed),
      Match.when(2, () => ResponseError.UnknownServiceVersion),
      Match.when(3, () => ResponseError.UnknownService),
      Match.when(4, () => ResponseError.UnknownProcedure),
      Match.when(5, () => ResponseError.InvalidTransportVersion),
      Match.when(6, () => ResponseError.InvalidPayloadSize),
      Match.when(7, () => ResponseError.InvalidPayload),
      Match.when(8, () => ResponseError.EncodingError),
      Match.when(9, () => ResponseError.DecodingError),
      Match.option,
    )
    .pipe(
      Effect.mapErrorCause((error) =>
        Cause.sequential(error, Cause.fail(new UnknownResponseError())),
      ),
    );
}

export const ResponseFlags = S.struct({
  endOfStream: S.boolean,
  streaming: S.boolean,
});

export interface ResponseFlags extends S.Schema.To<typeof ResponseFlags> {}

export const ResponseHeader = S.struct({
  version: S.number.pipe(S.fromBrand(TransportVersion)),
  flags: ResponseFlags,
  size: S.number.pipe(S.fromBrand(PayloadSize)),
});

export interface ResponseHeader extends S.Schema.To<typeof ResponseHeader> {}

export const ResponseBody = S.union(
  S.struct({
    body: S.Uint8ArrayFromSelf,
  }),
  S.struct({
    error: S.enums(ResponseError),
  }),
);

export interface ResponseBody extends S.Schema.To<typeof ResponseBody> {}

export const Response = S.struct({
  header: ResponseHeader,
  body: ResponseBody,
});

export interface Response extends S.Schema.To<typeof Response> {}
export interface ResponseFrom extends S.Schema.From<typeof Response> {}

function readFlags(reader: Reader) {
  return Effect.gen(function* (_) {
    const flags = yield* _(reader.readBytes(2));

    const endOfStream = (flags[1] & 0b0000_0010) === 0b0000_0010;
    const streaming = (flags[1] & 0b0000_0001) === 0b0000_0001;

    return {
      endOfStream,
      streaming,
    } satisfies ResponseFlags;
  });
}

export function readResponse(buffer: Uint8Array) {
  return Effect.gen(function* (_) {
    const reader = new Reader(buffer);

    const version: TransportVersion = yield* _(
      reader.readByte(),
      Effect.andThen((value) => TransportVersion.option(value)),
    );

    if (version !== TRANSPORT_VERSION) {
      yield* _(new UnsupportedTransportVersionError());
    }

    const flags = yield* _(readFlags(reader));

    const status = yield* _(reader.readByte());
    if (status === 0) {
      // successful response
      const size = yield* _(
        reader.readVarUInt32(),
        Effect.andThen((value) => PayloadSize.option(value)),
      );
      const body = yield* _(reader.readBytes(size));

      return {
        header: {
          version,
          flags,
          size,
        },
        body: {
          body,
        },
      } satisfies Response;
    } else {
      const error = yield* _(responseErrorFromErrorCode(status));

      return {
        header: {
          version,
          flags,
          size: PayloadSize(0),
        },
        body: {
          error,
        },
      } satisfies Response;
    }
  }).pipe(Effect.andThen((value) => S.parse(Response)(value)));
}
