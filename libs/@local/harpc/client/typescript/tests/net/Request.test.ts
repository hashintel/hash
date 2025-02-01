import { describe, it } from "@effect/vitest";
import { Chunk, Effect, pipe, Predicate, Stream } from "effect";
import type * as vitest from "vitest";

import { Request } from "../../src/net/index.js";
import {
  ProcedureDescriptor,
  ProcedureId,
  SubsystemDescriptor,
  SubsystemId,
  Version,
} from "../../src/types/index.js";
import { RequestIdProducer } from "../../src/wire-protocol/index.js";
import { Payload } from "../../src/wire-protocol/models/index.js";
import {
  type Request as WireRequest,
  RequestBody,
  RequestFlags,
} from "../../src/wire-protocol/models/request/index.js";
import { expectArrayBuffer } from "../wire-protocol/utils.js";

const makeRequest = Effect.fn("makeRequest")(function* <E, R>(
  stream: Stream.Stream<ArrayBuffer, E, R>,
) {
  return yield* Request.make(
    SubsystemDescriptor.make(
      yield* SubsystemId.make(0x00),
      Version.make(0x00, 0x00),
    ),
    ProcedureDescriptor.make(yield* ProcedureId.make(0x00)),
    stream,
  );
});

const assertBody = (
  cx: vitest.TaskContext<vitest.RunnerTestCase> & vitest.TestContext,
  request: WireRequest.Request,
  bodyIs: (request: RequestBody.RequestBody) => boolean,
  body: string | number,
) => {
  cx.expect(bodyIs(request.body)).toBeTruthy();

  const buffer = RequestBody.mapBoth(
    request.body,
    (beginOrFrame) => beginOrFrame.payload.buffer,
  );

  if (Predicate.isString(body)) {
    const text = new TextDecoder().decode(buffer);

    cx.expect(text).toBe(body);
  } else if (Predicate.isNumber(body)) {
    cx.expect(buffer.byteLength).toBe(body);
  }

  return {
    assertEnd: () => {
      cx.expect(RequestFlags.isEndOfRequest(request.header.flags)).toBeTruthy();
    },
  };
};

describe.concurrent("Request", () => {
  it.effect("no data", (cx) =>
    Effect.gen(function* () {
      const request = yield* makeRequest(Stream.empty);

      const items = yield* pipe(
        Request.encode(request),
        Stream.runCollect,
        Effect.map(Chunk.toReadonlyArray),
      );

      cx.expect(items.length).toBe(1);
      assertBody(cx, items[0]!, RequestBody.isBegin, 0);
    }).pipe(Effect.provide(RequestIdProducer.layer)),
  );

  it.effect("leftover", (cx) =>
    Effect.gen(function* () {
      const encoder = new TextEncoder();

      const request = yield* makeRequest(
        Stream.fromIterable([
          expectArrayBuffer(cx, encoder.encode("hello").buffer),
        ]),
      );

      const items = yield* pipe(
        Request.encode(request),
        Stream.runCollect,
        Effect.map(Chunk.toReadonlyArray),
      );

      cx.expect(items.length).toBe(1);
      assertBody(cx, items[0]!, RequestBody.isBegin, "hello").assertEnd();
    }).pipe(Effect.provide(RequestIdProducer.layer)),
  );

  it.effect("split single", (cx) =>
    Effect.gen(function* () {
      const array = new Uint8Array(Payload.MAX_SIZE + 8);

      const request = yield* makeRequest(Stream.fromIterable([array.buffer]));

      const items = yield* pipe(
        Request.encode(request),
        Stream.runCollect,
        Effect.map(Chunk.toReadonlyArray),
      );

      cx.expect(items.length).toBe(2);
      assertBody(cx, items[0]!, RequestBody.isBegin, Payload.MAX_SIZE);
      assertBody(cx, items[1]!, RequestBody.isFrame, 8).assertEnd();
    }).pipe(Effect.provide(RequestIdProducer.layer)),
  );

  it.effect("split single with leftovers", (cx) =>
    Effect.gen(function* () {
      const array = new Uint8Array(Payload.MAX_SIZE + 8);

      const request = yield* makeRequest(
        Stream.fromIterable([
          array.buffer,
          expectArrayBuffer(cx, new TextEncoder().encode("hello").buffer),
        ]),
      );

      const items = yield* pipe(
        Request.encode(request),
        Stream.runCollect,
        Effect.map(Chunk.toReadonlyArray),
      );

      cx.expect(items.length).toBe(2);
      assertBody(cx, items[0]!, RequestBody.isBegin, Payload.MAX_SIZE);
      assertBody(cx, items[1]!, RequestBody.isFrame, 8 + 5).assertEnd();
    }).pipe(Effect.provide(RequestIdProducer.layer)),
  );

  it.effect("split multiple", (cx) =>
    Effect.gen(function* () {
      const array = new Uint8Array(Payload.MAX_SIZE * 2 + 8);

      const request = yield* makeRequest(Stream.fromIterable([array.buffer]));

      const items = yield* pipe(
        Request.encode(request),
        Stream.runCollect,
        Effect.map(Chunk.toReadonlyArray),
      );

      cx.expect(items.length).toBe(3);
      assertBody(cx, items[0]!, RequestBody.isBegin, Payload.MAX_SIZE);
      assertBody(cx, items[1]!, RequestBody.isFrame, Payload.MAX_SIZE);
      assertBody(cx, items[2]!, RequestBody.isFrame, 8).assertEnd();
    }).pipe(Effect.provide(RequestIdProducer.layer)),
  );

  it.effect("multiple small packets", (cx) =>
    Effect.gen(function* () {
      const encoder = new TextEncoder();

      const request = yield* makeRequest(
        Stream.fromIterable([
          expectArrayBuffer(cx, encoder.encode("hello").buffer),
          expectArrayBuffer(cx, encoder.encode("world").buffer),
        ]),
      );

      const items = yield* pipe(
        Request.encode(request),
        Stream.runCollect,
        Effect.map(Chunk.toReadonlyArray),
      );

      cx.expect(items.length).toBe(1);
      assertBody(cx, items[0]!, RequestBody.isBegin, "helloworld").assertEnd();
    }).pipe(Effect.provide(RequestIdProducer.layer)),
  );
});

describe.concurrent("Request - noDelay", () => {
  it.effect("no data", (cx) =>
    Effect.gen(function* () {
      const request = yield* makeRequest(Stream.empty);

      const items = yield* pipe(
        Request.encode(request, { noDelay: true }),
        Stream.runCollect,
        Effect.map(Chunk.toReadonlyArray),
      );

      cx.expect(items.length).toBe(1);
      assertBody(cx, items[0]!, RequestBody.isBegin, 0);
    }).pipe(Effect.provide(RequestIdProducer.layer)),
  );

  it.effect("leftover", (cx) =>
    Effect.gen(function* () {
      const encoder = new TextEncoder();

      const request = yield* makeRequest(
        Stream.fromIterable([
          expectArrayBuffer(cx, encoder.encode("hello").buffer),
        ]),
      );

      const items = yield* pipe(
        Request.encode(request, { noDelay: true }),
        Stream.runCollect,
        Effect.map(Chunk.toReadonlyArray),
      );

      cx.expect(items.length).toBe(1);
      assertBody(cx, items[0]!, RequestBody.isBegin, "hello").assertEnd();
    }).pipe(Effect.provide(RequestIdProducer.layer)),
  );

  it.effect("split single", (cx) =>
    Effect.gen(function* () {
      const array = new Uint8Array(Payload.MAX_SIZE + 8);

      const request = yield* makeRequest(Stream.fromIterable([array.buffer]));

      const items = yield* pipe(
        Request.encode(request, { noDelay: true }),
        Stream.runCollect,
        Effect.map(Chunk.toReadonlyArray),
      );

      cx.expect(items.length).toBe(2);
      assertBody(cx, items[0]!, RequestBody.isBegin, Payload.MAX_SIZE);
      assertBody(cx, items[1]!, RequestBody.isFrame, 8).assertEnd();
    }).pipe(Effect.provide(RequestIdProducer.layer)),
  );

  it.effect("split multiple", (cx) =>
    Effect.gen(function* () {
      const array = new Uint8Array(Payload.MAX_SIZE * 2 + 8);

      const request = yield* makeRequest(Stream.fromIterable([array.buffer]));

      const items = yield* pipe(
        Request.encode(request, { noDelay: true }),
        Stream.runCollect,
        Effect.map(Chunk.toReadonlyArray),
      );

      cx.expect(items.length).toBe(3);
      assertBody(cx, items[0]!, RequestBody.isBegin, Payload.MAX_SIZE);
      assertBody(cx, items[1]!, RequestBody.isFrame, Payload.MAX_SIZE);
      assertBody(cx, items[2]!, RequestBody.isFrame, 8).assertEnd();
    }).pipe(Effect.provide(RequestIdProducer.layer)),
  );

  it.effect("multiple small packets", (cx) =>
    Effect.gen(function* () {
      const encoder = new TextEncoder();

      const request = yield* makeRequest(
        Stream.fromIterable([
          expectArrayBuffer(cx, encoder.encode("hello").buffer),
          expectArrayBuffer(cx, encoder.encode("world").buffer),
        ]),
      );

      const items = yield* pipe(
        Request.encode(request, { noDelay: true }),
        Stream.runCollect,
        Effect.map(Chunk.toReadonlyArray),
      );

      cx.expect(items.length).toBe(2);
      assertBody(cx, items[0]!, RequestBody.isBegin, "hello");
      assertBody(cx, items[1]!, RequestBody.isFrame, "world").assertEnd();
    }).pipe(Effect.provide(RequestIdProducer.layer)),
  );
});
