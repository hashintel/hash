import { describe, it } from "@effect/vitest";
import {
  Cause,
  Effect,
  Exit,
  HashSet,
  pipe,
  Queue,
  Result,
  Sink,
  Stream,
} from "effect";

import {
  Connection,
  Request,
  Transaction,
  Transport,
} from "../../src/net/index.js";
import {
  ProcedureDescriptor,
  ProcedureId,
  ResponseKind,
  SubsystemDescriptor,
  SubsystemId,
  Version,
} from "../../src/types/index.js";
import { RequestIdProducer } from "../../src/wire-protocol/index.js";
import {
  Payload,
  Protocol,
  ProtocolVersion,
} from "../../src/wire-protocol/models/index.js";
import {
  Response,
  ResponseBegin,
  ResponseBody,
  ResponseFlags,
  ResponseHeader,
} from "../../src/wire-protocol/models/response/index.js";

import type { RequestId } from "../../src/wire-protocol/models/request/index.js";

const makeConnection = Effect.fn("makeConnection")(function* (
  write: Sink.Sink<void, unknown, never, Transport.TransportError>,
) {
  const responses = yield* Queue.unbounded<
    Response.Response,
    Transport.TransportError | Cause.Done
  >();

  const connection = yield* Connection.makeFromDuplex(
    { read: Stream.fromQueue(responses), write },
    {},
  );

  return { connection, responses };
});

const makeRequest = Effect.fn("makeRequest")(function* () {
  return yield* Request.make(
    SubsystemDescriptor.make(
      yield* SubsystemId.make(0x00),
      Version.make(0x00, 0x00),
    ),
    ProcedureDescriptor.make(yield* ProcedureId.make(0x00)),
    Stream.make(new TextEncoder().encode("ping").buffer),
  );
});

const makePartialResponse = Effect.fn("makePartialResponse")(function* (
  id: RequestId.RequestId,
) {
  const payload = yield* Payload.make(new TextEncoder().encode("partial"));

  return Response.make(
    ResponseHeader.make(
      Protocol.make(ProtocolVersion.V1),
      id,
      ResponseFlags.make(HashSet.empty()),
    ),
    ResponseBody.make(
      Result.succeed(ResponseBegin.make(ResponseKind.ok(), payload)),
    ),
  );
});

const readError = (transaction: Transaction.Transaction) =>
  pipe(
    Transaction.read(transaction).body,
    Stream.runDrain,
    Effect.exit,
    Effect.map((exit) => Exit.isFailure(exit) && Cause.squash(exit.cause)),
  );

describe.concurrent("Connection", () => {
  it.effect("read end", (cx) =>
    Effect.gen(function* () {
      const { connection, responses } = yield* makeConnection(Sink.drain);
      const request = yield* makeRequest();

      const first = yield* Connection.send(connection, request);
      const second = yield* Connection.send(connection, yield* makeRequest());

      yield* Queue.offer(responses, yield* makePartialResponse(request.id));
      yield* Queue.end(responses);

      cx.expect(yield* readError(first)).toBeInstanceOf(
        Transaction.ConnectionClosedError,
      );
      cx.expect(yield* readError(second)).toBeInstanceOf(
        Transaction.ConnectionClosedError,
      );
    }).pipe(Effect.provide(RequestIdProducer.layer)),
  );

  it.effect("read failure", (cx) =>
    Effect.gen(function* () {
      const { connection, responses } = yield* makeConnection(Sink.drain);
      const request = yield* makeRequest();
      const error = new Transport.TransportError({ cause: "reset" });

      const transaction = yield* Connection.send(connection, request);

      yield* Queue.offer(responses, yield* makePartialResponse(request.id));
      yield* Queue.fail(responses, error);

      cx.expect(yield* readError(transaction)).toBe(error);
    }).pipe(Effect.provide(RequestIdProducer.layer)),
  );

  it.effect("write failure", (cx) =>
    Effect.gen(function* () {
      const error = new Transport.TransportError({ cause: "closed" });
      const { connection } = yield* makeConnection(Sink.fail(error));

      const transaction = yield* Connection.send(
        connection,
        yield* makeRequest(),
      );

      cx.expect(yield* readError(transaction)).toBe(error);
    }).pipe(Effect.provide(RequestIdProducer.layer)),
  );

  it.effect("send after read end", (cx) =>
    Effect.gen(function* () {
      const { connection, responses } = yield* makeConnection(Sink.drain);

      const first = yield* Connection.send(connection, yield* makeRequest());

      yield* Queue.end(responses);
      yield* readError(first);
      // the read task is still failing open transactions, let it finish
      yield* Effect.yieldNow;

      const second = yield* Connection.send(connection, yield* makeRequest());

      cx.expect(yield* readError(second)).toBeInstanceOf(
        Transaction.ConnectionClosedError,
      );
    }).pipe(Effect.provide(RequestIdProducer.layer)),
  );
});
