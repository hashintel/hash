import { describe, it } from "@effect/vitest";
import {
  Cause,
  Deferred,
  Effect,
  Exit,
  HashSet,
  pipe,
  Queue,
  Result,
  Stream,
} from "effect";

import { Response as NetResponse, Transaction } from "../../src/net/index.js";
import { ErrorCode, ResponseKind } from "../../src/types/index.js";
import {
  Payload,
  Protocol,
  ProtocolVersion,
} from "../../src/wire-protocol/models/index.js";
import { RequestId } from "../../src/wire-protocol/models/request/index.js";
import {
  Response,
  ResponseBegin,
  ResponseBody,
  ResponseFlags,
  ResponseFrame,
  ResponseHeader,
} from "../../src/wire-protocol/models/response/index.js";

const requestId = RequestId.makeUnchecked(1);

const makeHeader = (endOfResponse: boolean) =>
  ResponseHeader.make(
    Protocol.make(ProtocolVersion.V1),
    requestId,
    ResponseFlags.make(
      HashSet.fromIterable<ResponseFlags.Flag>(
        endOfResponse ? ["endOfResponse"] : [],
      ),
    ),
  );

const makeBegin = Effect.fn("makeBegin")(function* (
  text: string,
  endOfResponse: boolean,
) {
  const payload = yield* Payload.make(new TextEncoder().encode(text));

  return Response.make(
    makeHeader(endOfResponse),
    ResponseBody.make(
      Result.succeed(ResponseBegin.make(ResponseKind.ok(), payload)),
    ),
  );
});

const makeFrame = Effect.fn("makeFrame")(function* (
  text: string,
  endOfResponse: boolean,
) {
  const payload = yield* Payload.make(new TextEncoder().encode(text));

  return Response.make(
    makeHeader(endOfResponse),
    ResponseBody.make(Result.fail(ResponseFrame.make(payload))),
  );
});

const makeTransaction = Effect.fn("makeTransaction")(function* () {
  const queue = yield* Queue.bounded<
    Response.Response,
    Transaction.TransactionLaggedError | Cause.Done
  >(16);
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- the drop handle carries no value
  const drop = yield* Deferred.make<void>();

  return {
    queue,
    transaction: Transaction.makeUnchecked(requestId, queue, drop),
  };
});

const readText = (transaction: Transaction.Transaction) =>
  pipe(
    Transaction.read(transaction).body,
    Stream.runCollect,
    Effect.map((buffers) =>
      buffers.map((buffer) => new TextDecoder().decode(buffer)).join(""),
    ),
  );

describe.concurrent("Transaction", () => {
  it.effect("multi-packet response", (cx) =>
    Effect.gen(function* () {
      const { queue, transaction } = yield* makeTransaction();
      const first = yield* makeBegin("first ", false);
      const second = yield* makeFrame("second ", false);
      const third = yield* makeFrame("third", true);

      yield* Queue.offerAll(queue, [first, second, third]);
      yield* Queue.end(queue);

      const text = yield* readText(transaction);

      cx.expect(text).toBe("first second third");
    }),
  );

  it.effect("lagged", (cx) =>
    Effect.gen(function* () {
      const { queue, transaction } = yield* makeTransaction();
      const begin = yield* makeBegin("partial", false);

      yield* Queue.offer(queue, begin);
      yield* Queue.fail(
        queue,
        new Transaction.TransactionLaggedError({ id: requestId }),
      );

      const exit = yield* Effect.exit(readText(transaction));

      cx.expect(Exit.isFailure(exit)).toBeTruthy();
      cx.expect(
        Exit.isFailure(exit) && Cause.squash(exit.cause),
      ).toBeInstanceOf(Transaction.TransactionLaggedError);
    }),
  );

  it.effect("error response", (cx) =>
    Effect.gen(function* () {
      const { queue, transaction } = yield* makeTransaction();
      const payload = yield* Payload.make(new TextEncoder().encode("boom"));
      const response = Response.make(
        makeHeader(true),
        ResponseBody.make(
          Result.succeed(
            ResponseBegin.make(
              ResponseKind.err(ErrorCode.makeUnchecked(1)),
              payload,
            ),
          ),
        ),
      );

      yield* Queue.offer(queue, response);
      yield* Queue.end(queue);

      const exit = yield* Effect.exit(readText(transaction));

      cx.expect(
        Exit.isFailure(exit) && Cause.squash(exit.cause),
      ).toBeInstanceOf(NetResponse.NetworkError);
    }),
  );
});
