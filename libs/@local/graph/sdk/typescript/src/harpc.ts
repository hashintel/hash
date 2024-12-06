// This code is written in a way that be *easily* auto generated, which is why we use the classes.

import { Decoder, Encoder } from "@local/harpc-client/codec";
import { Connection, Request, Transaction } from "@local/harpc-client/net";
import {
  ProcedureDescriptor,
  ProcedureId,
  ResponseKind,
  SubsystemDescriptor,
  SubsystemId,
  Version,
} from "@local/harpc-client/types";
import { Effect, Option, Schema, Stream } from "effect";

// This should probably move into @local/harpc-client
export class

export class AccountSubsystem {
  static #subsystemId = 0x00;
  static #version = Version.make(0x00, 0x00);

  // eslint-disable-next-line func-names
  static echo = Effect.fn("echo")(function* (payload: string) {
    const procedureId = 0x00;

    const connection = yield* Connection.Connection;
    const encoder = yield* Encoder.Encoder;
    const decoder = yield* Decoder.Decoder;

    const requestStream = encoder.encode(
      Stream.succeed(payload),
      Schema.String,
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
    const response = yield* Transaction.read(transaction);

    // ResponseKind.match({
    //   onOk: () => Option.none,
    //   onErr: (errorCode) =>
    // });

    const items = decoder.decode(response.body, Schema.String);
    const item = yield* Stream.runHead(items);

    return Option.getOrThrowWith(item, () => new Error("No response"));
  }, Effect.scoped);
}
