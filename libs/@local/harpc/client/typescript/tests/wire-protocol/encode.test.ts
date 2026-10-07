import { NodeServices } from "@effect/platform-node";
import { type TestContext, describe, it } from "@effect/vitest";
import { Effect, Option, Predicate } from "effect";

import { MutableBuffer } from "../../src/binary/index.js";
import {
  Request,
  RequestBegin,
  RequestBody,
  RequestFlags,
  RequestFrame,
  RequestHeader,
} from "../../src/wire-protocol/models/request/index.js";
import { callEncode } from "./utils.js";

interface RequestHeaderData {
  protocol: {
    version: number;
  };
  request_id: number;
  flags: number;
}

const assertRequestHeader = (
  cx: TestContext,
  a: RequestHeader.RequestHeader,
  b: RequestHeaderData,
) => {
  cx.expect(a.protocol.version.value).toBe(b.protocol.version);
  cx.expect(a.requestId.value).toBe(b.request_id);
  cx.expect(RequestFlags.repr(a.flags)).toBe(b.flags);
};

interface RequestBeginData {
  subsystem: {
    id: number;
    version: {
      major: number;
      minor: number;
    };
  };
  procedure: {
    id: number;
  };
  payload: number[];
}

const assertRequestBegin = (
  cx: TestContext,
  a: RequestBegin.RequestBegin,
  b: RequestBeginData,
) => {
  cx.expect(a.subsystem.id.value).toBe(b.subsystem.id);
  cx.expect(a.subsystem.version.major).toBe(b.subsystem.version.major);
  cx.expect(a.subsystem.version.minor).toBe(b.subsystem.version.minor);
  cx.expect(a.procedure.id.value).toBe(b.procedure.id);
  cx.expect([...a.payload.buffer]).toEqual(b.payload);
};

interface RequestFrameData {
  payload: number[];
}

const assertRequestFrame = (
  cx: TestContext,
  a: RequestFrame.RequestFrame,
  b: RequestFrameData,
) => {
  cx.expect([...a.payload.buffer]).toEqual(b.payload);
};

interface RequestData {
  header: RequestHeaderData;
  body: { Begin: RequestBeginData } | { Frame: RequestFrameData };
}

const assertRequest = (cx: TestContext, a: Request.Request, b: RequestData) => {
  // we need to apply the body variant here, because the encoding function does that already for us, even if we have wrong flags set in the header
  assertRequestHeader(
    cx,
    RequestHeader.applyBodyVariant(a.header, RequestBody.variant(a.body)),
    b.header,
  );

  if (Predicate.hasProperty(b.body, "Begin")) {
    assertRequestBegin(
      cx,
      a.body.pipe(RequestBody.getBegin, Option.getOrThrow),
      b.body.Begin,
    );
  } else {
    assertRequestFrame(
      cx,
      a.body.pipe(RequestBody.getFrame, Option.getOrThrow),
      b.body.Frame,
    );
  }
};

describe.concurrent("encode", () => {
  it.effect.prop(
    "encode request-header",
    { header: RequestHeader.arbitrary },
    ({ header }, cx) =>
      Effect.gen(function* () {
        const buffer = MutableBuffer.makeWrite();

        yield* Effect.fromResult(RequestHeader.encode(buffer, header));

        const array = MutableBuffer.take(buffer);
        const received = yield* callEncode(
          "request-header",
          new Uint8Array(array),
        );

        assertRequestHeader(cx, header, received as RequestHeaderData);
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect.prop(
    "encode request-begin",
    { begin: RequestBegin.arbitrary },
    ({ begin }, cx) =>
      Effect.gen(function* () {
        const buffer = MutableBuffer.makeWrite();

        yield* Effect.fromResult(RequestBegin.encode(buffer, begin));

        const array = MutableBuffer.take(buffer);
        const received = yield* callEncode(
          "request-begin",
          new Uint8Array(array),
        );

        assertRequestBegin(cx, begin, received as RequestBeginData);
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect.prop(
    "encode request-frame",
    { frame: RequestFrame.arbitrary },
    ({ frame }, cx) =>
      Effect.gen(function* () {
        const buffer = MutableBuffer.makeWrite();

        yield* Effect.fromResult(RequestFrame.encode(buffer, frame));

        const array = MutableBuffer.take(buffer);
        const received = yield* callEncode(
          "request-frame",
          new Uint8Array(array),
        );

        assertRequestFrame(cx, frame, received as RequestFrameData);
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect.prop(
    "encode request",
    { request: Request.arbitrary },
    ({ request }, cx) =>
      Effect.gen(function* () {
        const buffer = MutableBuffer.makeWrite();

        yield* Effect.fromResult(Request.encode(buffer, request));

        const array = MutableBuffer.take(buffer);
        const received = yield* callEncode("request", new Uint8Array(array));

        assertRequest(cx, request, received as RequestData);
      }).pipe(Effect.provide(NodeServices.layer)),
  );
});
