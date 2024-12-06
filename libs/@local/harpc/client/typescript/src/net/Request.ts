import { Effect, Function, Option, pipe, Predicate, Ref, Stream } from "effect";

import type {
  ProcedureDescriptor,
  SubsystemDescriptor,
} from "../types/index.js";
import { createProto } from "../utils.js";
import { RequestIdProducer } from "../wire-protocol/index.js";
import {
  Payload,
  Protocol,
  ProtocolVersion,
} from "../wire-protocol/models/index.js";
import type { RequestId } from "../wire-protocol/models/request/index.js";
import {
  Request,
  RequestBegin,
  RequestBody,
  RequestFlags,
  RequestFrame,
  RequestHeader,
} from "../wire-protocol/models/request/index.js";

const TypeId: unique symbol = Symbol("@local/harpc-client/net/Request");
export type TypeId = typeof TypeId;

export interface Request<E, R> {
  readonly [TypeId]: TypeId;

  readonly id: RequestId.RequestId;

  readonly subsystem: SubsystemDescriptor.SubsystemDescriptor;
  readonly procedure: ProcedureDescriptor.ProcedureDescriptor;

  readonly body: Stream.Stream<ArrayBuffer, E, R>;
}

const RequestProto: Omit<
  Request<unknown, unknown>,
  "id" | "subsystem" | "procedure" | "body"
> = {
  [TypeId]: TypeId,
};

export const make = <E, R>(
  subsystem: SubsystemDescriptor.SubsystemDescriptor,
  procedure: ProcedureDescriptor.ProcedureDescriptor,

  body: Stream.Stream<ArrayBuffer, E, R>,
) =>
  Effect.gen(function* () {
    const producer = yield* RequestIdProducer.RequestIdProducer;
    const id = yield* RequestIdProducer.next(producer);

    return createProto(RequestProto, {
      id,
      subsystem,
      procedure,
      body,
    }) as Request<E, R>;
  });

interface Scratch {
  buffer: ArrayBuffer;
  length: number;
}

const makeScratch = (): Scratch => ({
  buffer: new ArrayBuffer(Payload.MAX_SIZE),
  length: 0,
});

const splitBuffer = (scratch: Scratch, that: ArrayBuffer) => {
  let self = scratch;
  let buffer = that;

  const output: ArrayBuffer[] = [];

  while (self.length + buffer.byteLength > Payload.MAX_SIZE) {
    const available = Payload.MAX_SIZE - self.length;

    const selfView = new Uint8Array(self.buffer);
    selfView.set(new Uint8Array(buffer, 0, available), self.length);

    output.push(self.buffer);

    buffer = buffer.slice(available);
    self = makeScratch();
  }

  // if we reach here, we know that the buffer can fit in the scratch buffer.
  // we can just copy the buffer into the scratch buffer.
  if (buffer.byteLength > 0) {
    const view = new Uint8Array(self.buffer);
    view.set(new Uint8Array(buffer), self.length);

    self.length += buffer.byteLength;
  }

  return [self, output] as const;
};

const pack = <E, R>(
  stream: Stream.Stream<ArrayBuffer, E, R>,
  options?: {
    readonly noDelay?: boolean;
  },
) =>
  Effect.gen(function* () {
    const noDelay = options?.noDelay ?? false;

    // take the stream of ArrayBuffer and partition it so that a single packet is never larger than PAYLOAD_SIZE,
    // if noDelay is false we additionally ensures that we try to pack as much as possible.
    if (noDelay) {
      return pipe(
        stream,
        Stream.mapConcat((buffer) => {
          const [scratch, output] = splitBuffer(makeScratch(), buffer);

          output.push(scratch.buffer.slice(0, scratch.length));

          return output;
        }),
      );
    }

    const scratch = yield* Ref.make(makeScratch());

    return pipe(
      stream,
      Stream.mapConcatEffect((buffer) =>
        Effect.gen(function* () {
          const [newScratch, output] = splitBuffer(
            yield* Ref.get(scratch),
            buffer,
          );

          yield* Ref.set(scratch, newScratch);

          return output;
        }),
      ),
      Stream.concat(
        Stream.fromIterableEffect(
          Effect.suspend(() =>
            Effect.gen(function* () {
              const current = yield* Ref.get(scratch);

              return current.length > 0
                ? [current.buffer.slice(0, current.length)]
                : [];
            }),
          ),
        ),
      ),
    );
  }).pipe(Stream.unwrap);

export interface EncodeOptions {
  readonly noDelay?: boolean;
}

const encodeImpl = <E, R>(
  self: Request<E, R>,
  options?: EncodeOptions,
): Stream.Stream<Request.Request, E, R> =>
  Effect.gen(function* () {
    const requestId = self.id;

    const nonEmpty = yield* Ref.make(false);

    return pipe(
      pack(self.body, options),
      Stream.zipWithNext,
      Stream.zipWithIndex,
      Stream.map(([[current, next], index]) => ({
        buffer: current,
        isEnd: Option.isNone(next),
        isFirst: index === 0,
      })),
      Stream.mapEffect(({ buffer, isEnd, isFirst }) =>
        Effect.gen(function* () {
          yield* Ref.set(nonEmpty, true);

          const flags = RequestFlags.make().pipe(
            isEnd ? RequestFlags.withEndOfRequest : Function.identity,
          );

          const header = RequestHeader.make(
            Protocol.make(ProtocolVersion.V1),
            requestId,
            flags,
          );

          const payload = yield* Payload.makeAssert(new Uint8Array(buffer));

          const body = isFirst
            ? RequestBegin.make(self.subsystem, self.procedure, payload).pipe(
                RequestBody.makeBegin,
              )
            : RequestFrame.make(payload).pipe(RequestBody.makeFrame);

          return Request.make(header, body);
        }),
      ),
      // if we're at the end of the stream and the stream is empty, we need to send a single empty request.
      Stream.concat(
        Stream.fromIterableEffect(
          Effect.suspend(() =>
            Effect.gen(function* () {
              const isEmpty = !(yield* Ref.get(nonEmpty));

              return isEmpty
                ? [
                    Request.make(
                      RequestHeader.make(
                        Protocol.make(ProtocolVersion.V1),
                        requestId,
                        RequestFlags.make().pipe(RequestFlags.withEndOfRequest),
                      ),
                      RequestBegin.make(
                        self.subsystem,
                        self.procedure,
                        yield* Payload.makeAssert(new Uint8Array()),
                      ).pipe(RequestBody.makeBegin),
                    ),
                  ]
                : [];
            }),
          ),
        ),
      ),
    );
  }).pipe(Stream.unwrap);

const isStream = (
  value: unknown,
): value is Stream.Stream<unknown, unknown, unknown> =>
  Predicate.hasProperty(value, Stream.StreamTypeId) || Effect.isEffect(value);

export const encode: {
  <E, R>(
    self: Request<E, R>,
    options?: EncodeOptions,
  ): Stream.Stream<Request.Request, E, R>;

  (
    options?: EncodeOptions,
  ): <E, R>(self: Request<E, R>) => Stream.Stream<Request.Request, E, R>;
} = Function.dual(
  // data-last if no options are provided, or if the first argument **is not** a stream.
  (args) => args.length === 0 || !isStream(args[0]),
  encodeImpl,
);
