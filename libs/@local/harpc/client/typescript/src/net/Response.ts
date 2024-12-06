import {
  Data,
  Effect,
  Either,
  Function,
  Option,
  pipe,
  Ref,
  Stream,
} from "effect";

import { MutableBytes } from "../binary/index.js";
import { ErrorCode, ResponseKind } from "../types/index.js";
import { createProto } from "../utils.js";
import type {
  Response,
  ResponseBegin,
} from "../wire-protocol/models/response/index.js";
import {
  ResponseBody,
  ResponseFlags,
  ResponseFrame,
} from "../wire-protocol/models/response/index.js";

const TypeId = Symbol("@local/harpc-client/net/Response");
export type TypeId = typeof TypeId;

export class UnexpectedResponseTypeError extends Data.TaggedError(
  "UnexpectedResponseTypeError",
)<{ expected: "Begin" | "Frame"; received: "Begin" | "Frame" }> {
  get message() {
    return `Expected response type '${this.expected}', but received '${this.received}'`;
  }
}

export class EmptyResponseError extends Data.TaggedError("EmptyResponseError") {
  get message() {
    return "No response received: expected at least one response in the stream";
  }
}

export class InvalidUtf8Error extends Data.TaggedError("InvalidUtf8Error")<{
  cause: unknown;
}> {
  get message() {
    return "Invalid UTF-8 encoding";
  }
}

export class NetworkError extends Data.TaggedError("NetworkError")<{
  code: ErrorCode.ErrorCode;
  bytes: MutableBytes.MutableBytes;
}> {
  get display() {
    const decoder = new TextDecoder("utf-8", { fatal: true });

    return Effect.try({
      try: () => decoder.decode(MutableBytes.asBuffer(this.bytes)),
      catch: (cause) => new InvalidUtf8Error({ cause }),
    });
  }
}

export interface Response<E, R> {
  readonly [TypeId]: TypeId;

  readonly body: Stream.Stream<ArrayBuffer, E, R>;
}

const ResponseProto: Omit<Response<unknown, unknown>, "kind" | "body"> = {
  [TypeId]: TypeId,
};

const make = <E, R>(body: Stream.Stream<ArrayBuffer, E, R>): Response<E, R> =>
  createProto(ResponseProto, {
    body,
  });

interface Context {
  readonly partialError: Ref.Ref<Option.Option<NetworkError>>;
  readonly leftover: Ref.Ref<ArrayBuffer[]>;

  readonly finishError: Effect.Effect<Option.Option<NetworkError>>;
  readonly replaceError: (
    code: ErrorCode.ErrorCode,
    initialArray: Uint8Array,
  ) => Effect.Effect<void>;
}

interface ProcessingResult {
  error: Option.Option<NetworkError>;
  output: ArrayBuffer[];
}

const handleResponseFrame = (cx: Context, frame: ResponseFrame.ResponseFrame) =>
  Effect.gen(function* () {
    const partialError = yield* cx.partialError.get;
    const payloadArray = frame.payload.buffer;

    return Option.match(partialError, {
      onNone: (): ProcessingResult => ({
        error: Option.none(),
        output: [payloadArray.buffer as ArrayBuffer],
      }),
      onSome: (error): ProcessingResult => {
        MutableBytes.appendArray(error.bytes, payloadArray);

        return {
          error: Option.none(),
          output: [],
        };
      },
    });
  });

const handleResponseBegin = (cx: Context, begin: ResponseBegin.ResponseBegin) =>
  Effect.gen(function* () {
    const payloadArray = begin.payload.buffer;

    // we need to check if we have completed an error
    // TODO: in case we're okay, we need to frontload that... stuff
    const error = yield* cx.finishError;

    const kind = begin.kind;
    if (ResponseKind.isOk(kind)) {
      return {
        error,
        output: [payloadArray.buffer as ArrayBuffer],
      } satisfies ProcessingResult as ProcessingResult;
    }

    yield* cx.replaceError(kind.code, payloadArray);

    return {
      error,
      output: [],
    } satisfies ProcessingResult as ProcessingResult;
  });

const handleResponse = (cx: Context, response: Response.Response) =>
  Effect.gen(function* () {
    const body = ResponseBody.mapBoth(response.body, Function.identity);

    const output = yield* ResponseFrame.isResponseFrame(body)
      ? handleResponseFrame(cx, body)
      : handleResponseBegin(cx, body);

    if (ResponseFlags.isEndOfResponse(response.header.flags)) {
      yield* Ref.set(cx.exhausted, true);
      const error = yield* cx.finishError;
    }

    return output;
  });

const bodyStream = <E, R>(
  responses: Stream.Stream<Response.Response, E, R>,
) => {
  let partialError: Option.Option<NetworkError> = Option.none();

  const finishError = Effect.gen(function* () {
    // we need to check if we have completed an error
    const error = partialError;
    partialError = Option.none();

    if (Option.isSome(error)) {
      yield* error.value;
    }
  });

  return pipe(
    responses,
    Stream.mapConcatEffect((response) =>
      ResponseBody.match(response.body, {
        onFrame: (frame) =>
          Effect.succeed(
            Option.match(partialError, {
              onNone: () => [frame.payload.buffer.buffer as ArrayBuffer],
              onSome: (error) => {
                MutableBytes.appendArray(error.bytes, frame.payload.buffer);

                return [] as ArrayBuffer[];
              },
            }),
          ),
        onBegin: (begin) =>
          Effect.gen(function* () {
            // we need to check if we have completed an error
            yield* finishError;

            const kind = begin.kind;
            if (ResponseKind.isOk(kind)) {
              return [];
            }

            const errorCode = kind.code;
            const bytes = MutableBytes.make();
            MutableBytes.appendArray(bytes, begin.payload.buffer);

            partialError = Option.some(
              new NetworkError({
                code: errorCode,
                bytes,
              }),
            );

            return [];
          }),
      }),
    ),
  );
};

export type DecodeError<E = never> = Effect.Effect.Error<
  ReturnType<typeof decode<E, never>>
>;

export const decode = <E, R>(stream: Stream.Stream<Response.Response, E, R>) =>
  Effect.gen(function* () {
    // any error that occurs on the stream is caught and wrapped in a `NetworkError`
  });

// export const decode = <E, R>(stream: Stream.Stream<Response.Response, E, R>) =>
//   Effect.gen(function* () {
//     const [beginResponseMaybe, frameResponse] = yield* Stream.peel(
//       stream,
//       Sink.head(),
//     );

//     const beginResponse = yield* Effect.mapError(
//       beginResponseMaybe,
//       () => new EmptyResponseError(),
//     );

//     const begin = yield* Effect.mapError(
//       ResponseBody.getBegin(beginResponse.body),
//       () =>
//         new UnexpectedResponseTypeError({
//           expected: "Begin",
//           received: "Frame",
//         }),
//     );

//     return make(begin.kind, bodyStream(beginResponse, frameResponse));
//   });
