import { Data, Effect, pipe, Sink, Stream } from "effect";

import type { ResponseKind } from "../types/index.js";
import { createProto } from "../utils.js";
import type { Response } from "../wire-protocol/models/response/index.js";
import {
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

export interface Response<E, R> {
  readonly [TypeId]: TypeId;

  readonly kind: ResponseKind.ResponseKind;
  readonly body: Stream.Stream<ArrayBuffer, E, R>;
}

const ResponseProto: Omit<Response<unknown, unknown>, "kind" | "body"> = {
  [TypeId]: TypeId,
};

const make = <E, R>(
  kind: ResponseKind.ResponseKind,
  body: Stream.Stream<ArrayBuffer, E, R>,
): Response<E, R> =>
  createProto(ResponseProto, {
    kind,
    body,
  });

const bodyStream = <E, R>(
  begin: Response.Response,
  frames: Stream.Stream<Response.Response, E, R>,
) => {
  const beginArray = ResponseBody.mapBoth(
    begin.body,
    (_) => _.payload.buffer.buffer,
  );

  const beginBuffer = Stream.sync(() => beginArray);

  if (ResponseFlags.isEndOfResponse(begin.header.flags)) {
    return beginBuffer;
  }

  const frameBuffer = pipe(
    frames,
    Stream.takeWhile(
      (response) => !ResponseFlags.isEndOfResponse(response.header.flags),
    ),
    Stream.mapEffect((response) =>
      pipe(
        response.body,
        ResponseBody.getFrame,
        Effect.map((_) => _.payload.buffer.buffer),
        Effect.mapError(
          (_) =>
            new UnexpectedResponseTypeError({
              expected: "Frame",
              received: "Begin",
            }),
        ),
      ),
    ),
  );

  return Stream.concat(beginBuffer, frameBuffer);
};

export type DecodeError<E = never> = Effect.Effect.Error<
  ReturnType<typeof decode<E, never>>
>;

export const decode = <E, R>(stream: Stream.Stream<Response.Response, E, R>) =>
  Effect.gen(function* () {
    const [beginResponseMaybe, frameResponse] = yield* Stream.peel(
      stream,
      Sink.head(),
    );

    const beginResponse = yield* Effect.mapError(
      beginResponseMaybe,
      () => new EmptyResponseError(),
    );

    const begin = yield* Effect.mapError(
      ResponseBody.getBegin(beginResponse.body),
      () =>
        new UnexpectedResponseTypeError({
          expected: "Begin",
          received: "Frame",
        }),
    );

    return make(begin.kind, bodyStream(beginResponse, frameResponse));
  });
