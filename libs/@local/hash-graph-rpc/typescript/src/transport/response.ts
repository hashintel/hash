import { PayloadSize, TransportVersion } from "./request";
import { Reader } from "./reader";
import { Cause, Data, Effect, Match } from "effect";

export class UnknownResponseError extends Data.TaggedError("UnknownResponse") {}

type ResponseError = Data.TaggedEnum<{
  DeadlineExceeded: {};
  ConnectionClosed: {};
  UnknownServiceVersion: {};
  UnknownService: {};
  UnknownProcedure: {};
  InvalidTransportVersion: {};
  InvalidPayloadSize: {};
  InvalidPayload: {};
  EncodingError: {};
  DecodingError: {};
}>;

const ResponseError = Data.taggedEnum<ResponseError>();

function responseErrorFromErrorCode(value: number) {
  return Match.value(value)
    .pipe(
      Match.when(0, () => ResponseError.DeadlineExceeded()),
      Match.when(1, () => ResponseError.ConnectionClosed()),
      Match.when(2, () => ResponseError.UnknownServiceVersion()),
      Match.when(3, () => ResponseError.UnknownService()),
      Match.when(4, () => ResponseError.UnknownProcedure()),
      Match.when(5, () => ResponseError.InvalidTransportVersion()),
      Match.when(6, () => ResponseError.InvalidPayloadSize()),
      Match.when(7, () => ResponseError.InvalidPayload()),
      Match.when(8, () => ResponseError.EncodingError()),
      Match.when(9, () => ResponseError.DecodingError()),
      Match.option,
    )
    .pipe(
      Effect.mapErrorCause((error) =>
        Cause.sequential(error, Cause.fail(new UnknownResponseError())),
      ),
    );
}

export interface ResponseFlags {
  endOfStream: boolean;
  streaming: boolean;
}

export interface ResponseHeader {
  version: TransportVersion;
  flags: ResponseFlags;
  size: PayloadSize;
}

export type ResponseBody =
  | {
      body: Uint8Array;
    }
  | {
      error: ResponseError;
    };

export interface Response {
  header: ResponseHeader;
  body: ResponseBody;
}

function readFlags(reader: Reader) {
  return Effect.gen(function* (_) {
    const flags = yield* _(reader.readBytes(1));

    const endOfStream = (flags[1] & 0b0000_0010) === 0b0000_0010;
    const streaming = (flags[1] & 0b0000_0001) === 0b0000_0001;

    return {
      endOfStream,
      streaming,
    } as ResponseFlags;
  });
}

export function readResponse(buffer: Uint8Array) {
  return Effect.gen(function* (_) {
    const reader = new Reader(buffer);

    const version = yield* _(reader.readByte());
    const flags = yield* _(readFlags(reader));

    const status = yield* _(reader.readByte());
    if (status === 0) {
      // successful response
      const size = yield* _(reader.readVarUInt32());
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
      } as Response;
    } else {
      const error = yield* _(responseErrorFromErrorCode(status));

      return {
        header: {
          version,
          flags,
          size: 0,
        },
        body: {
          error,
        },
      } as Response;
    }
  });
}
