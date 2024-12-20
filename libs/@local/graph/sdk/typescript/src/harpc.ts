// This code is written in a way that be *easily* auto generated, which is why we use the classes.

import { ClientError } from "@local/harpc-client";
import { Decoder, Encoder } from "@local/harpc-client/codec";
import {
  Connection,
  Request,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- otherwise TypeScript will fail on inference, I don't know why
  Response,
  Transaction,
} from "@local/harpc-client/net";
import {
  ProcedureDescriptor,
  ProcedureId,
  SubsystemDescriptor,
  SubsystemId,
  Version,
} from "@local/harpc-client/types";
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- otherwise TypeScript will fail on inference, I don't know why
import { RequestIdProducer } from "@local/harpc-client/wire-protocol";
import {
  Effect,
  Function,
  Option,
  pipe,
  Predicate,
  Schema,
  Stream,
} from "effect";

const ServerResult = <A, I, R>(ok: Schema.Schema<A, I, R>) =>
  Schema.transform(
    Schema.Union(
      Schema.Struct({
        Ok: ok,
      }),
      Schema.Struct({
        Err: Schema.Unknown,
      }),
    ),
    Schema.Either({
      left: Schema.instanceOf(ClientError.ServerError),
      right: Schema.typeSchema(ok),
    }),
    {
      strict: true,
      decode: (value) => {
        if (Predicate.hasProperty(value, "Ok")) {
          return { _tag: "Right", right: value.Ok } as const;
        }

        return {
          _tag: "Left",
          left: new ClientError.ServerError({ cause: value.Err }),
        } as const;
      },
      encode: (value) => {
        if (value._tag === "Right") {
          return { Ok: value.right };
        }

        return { Err: value.left.cause } as const;
      },
    },
  );

export class EchoSubsystem {
  static #subsystemId = 0x00;
  static #version = Version.make(0x00, 0x00);

  // eslint-disable-next-line func-names
  static echo = Effect.fn("echo")(function* (payload: string) {
    const procedureId = 0x00;

    const connection = yield* Connection.Connection;
    const encoder = yield* Encoder.Encoder;
    const decoder = yield* Decoder.Decoder;

    // buffer the stream, to send any encoding errors straight to the client
    // see: https://linear.app/hash/issue/H-3748/request-interruption
    const requestStream = yield* pipe(
      payload,
      Stream.succeed,
      encoder.encode(Schema.String),
      Stream.runCollect,
      Effect.map(Stream.fromChunk),
    );

    const request = yield* Request.make(
      SubsystemDescriptor.make(
        yield* SubsystemId.make(EchoSubsystem.#subsystemId),
        EchoSubsystem.#version,
      ),
      ProcedureDescriptor.make(yield* ProcedureId.make(procedureId)),
      requestStream,
    );

    const transaction = yield* Connection.send(connection, request);
    const response = Transaction.read(transaction);

    const items = decoder.decode(response.body, ServerResult(Schema.String));
    const item = yield* Stream.runHead(items);

    const eitherItem = Option.getOrThrowWith(item, () =>
      ClientError.ExpectedItemCountMismatchError.exactly(1, 0),
    );

    return yield* eitherItem;
  }, Effect.map(Function.identity));
}
