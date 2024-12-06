// This code is written in a way that be *easily* auto generated, which is why we use the classes.

import { ClientError } from "@local/harpc-client";
import { Decoder, Encoder } from "@local/harpc-client/codec";
import { Connection, Request, Transaction } from "@local/harpc-client/net";
import {
  ProcedureDescriptor,
  ProcedureId,
  SubsystemDescriptor,
  SubsystemId,
  Version,
} from "@local/harpc-client/types";
import { Effect, Option, pipe, Schema, Stream } from "effect";

export class AccountSubsystem {
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
        yield* SubsystemId.make(AccountSubsystem.#subsystemId),
        AccountSubsystem.#version,
      ),
      ProcedureDescriptor.make(yield* ProcedureId.make(procedureId)),
      requestStream,
    );

    const transaction = yield* Connection.send(connection, request);
    const response = Transaction.read(transaction);

    const items = decoder.decode(response.body, Schema.String);
    const item = yield* Stream.runHead(items);

    return Option.getOrThrowWith(item, () =>
      ClientError.ExpectedItemCountMismatchError.exactly(1, 0),
    );
  });
}
