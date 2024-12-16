import { Data, Effect, Option, pipe, Stream } from "effect";

import { MutableBytes } from "../binary/index.js";
import { InvalidUtf8Error } from "../ClientError.js";
import { type ErrorCode, ResponseKind } from "../types/index.js";
import { createProto } from "../utils.js";
import {
  type Response,
  ResponseBody,
  ResponseFlags,
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

type ResponseSegment = Data.TaggedEnum<{
  ControlFlow: {
    readonly code: Option.Option<ErrorCode.ErrorCode>;
  };
  Body: {
    readonly data: ArrayBuffer;
  };
}>;

const ResponseSegment = Data.taggedEnum<ResponseSegment>();

const flattenResponseStream = <E, R>(
  stream: Stream.Stream<Response.Response, E, R>,
) =>
  pipe(
    stream,
    Stream.takeUntil((response) =>
      ResponseFlags.isEndOfResponse(response.header.flags),
    ),
    Stream.mapConcat((response) => {
      const output: ResponseSegment[] = [];

      const begin = ResponseBody.getBegin(response.body);

      if (Option.isSome(begin)) {
        const { kind } = begin.value;
        const code = ResponseKind.getErr(kind);

        output.push(ResponseSegment.ControlFlow({ code }));
      }

      const payload = ResponseBody.mapBoth(
        response.body,
        (beginOrFrame) => beginOrFrame.payload.buffer.buffer as ArrayBuffer,
      );

      output.push(ResponseSegment.Body({ data: payload }));

      return output;
    }),
  );

const processResponseStream = <E, R>(
  stream: Stream.Stream<ResponseSegment, E, R>,
) => {
  let partialError: Option.Option<NetworkError> = Option.none();

  return pipe(
    stream,
    Stream.mapConcatEffect((segment) => {
      return ResponseSegment.$match(segment, {
        ControlFlow: ({ code }) => {
          // replace the existing error with a new one if we have an error
          const error = partialError;

          partialError = Option.map(
            code,
            (_) => new NetworkError({ code: _, bytes: MutableBytes.make() }),
          );

          return Option.match(error, {
            onNone: () => Effect.succeed([]),
            onSome: Effect.fail,
          });
        },
        Body: ({ data }) => {
          if (Option.isNone(partialError)) {
            return Effect.succeed([data]);
          }

          MutableBytes.appendBuffer(partialError.value.bytes, data);

          return Effect.succeed([]);
        },
      });
    }),
  );
};

export const decode = <E, R>(stream: Stream.Stream<Response.Response, E, R>) =>
  make(pipe(stream, flattenResponseStream, processResponseStream));
