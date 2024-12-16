import { NodeContext } from "@effect/platform-node";
import { describe, it } from "@effect/vitest";
import { Effect, Equal, Schema } from "effect";

import { ResponseKind } from "../../src/types/index.js";
import { Buffer } from "../../src/wire-protocol/index.js";
import {
  Response,
  ResponseBegin,
  ResponseBody,
  ResponseFlags,
  ResponseFrame,
  ResponseHeader,
} from "../../src/wire-protocol/models/response/index.js";

import { callDecode } from "./utils.js";

const ResponseHeaderFromSelf = Schema.declare(ResponseHeader.isResponseHeader, {
  arbitrary: () => ResponseHeader.arbitrary,
});

interface ResponseHeaderData {
  protocol: {
    version: number;
  };
  request_id: number;
  flags: number;
}

const convertResponseHeader = (
  header: ResponseHeader.ResponseHeader,
): ResponseHeaderData => ({
  protocol: {
    version: header.protocol.version.value,
  },
  request_id: header.requestId.value,
  flags: ResponseFlags.repr(header.flags),
});

const ResponseBeginFromSelf = Schema.declare(ResponseBegin.isResponseBegin, {
  arbitrary: () => ResponseBegin.arbitrary,
});

interface ResponseBeginData {
  kind: "Ok" | { Err: number };
  payload: number[];
}

const convertResponseBegin = (
  begin: ResponseBegin.ResponseBegin,
): ResponseBeginData => ({
  kind: ResponseKind.match(begin.kind, {
    onOk: () => "Ok",
    onErr: (code) => ({ Err: code.value }),
  }),
  payload: [...begin.payload.buffer],
});

const ResponseFrameFromSelf = Schema.declare(ResponseFrame.isResponseFrame, {
  arbitrary: () => ResponseFrame.arbitrary,
});

interface ResponseFrameData {
  payload: number[];
}

const convertResponseFrame = (
  frame: ResponseFrame.ResponseFrame,
): ResponseFrameData => ({
  payload: [...frame.payload.buffer],
});

const ResponseFromSelf = Schema.declare(Response.isResponse, {
  arbitrary: () => Response.arbitrary,
});

interface ResponseData {
  header: ResponseHeaderData;
  body: { Begin: ResponseBeginData } | { Frame: ResponseFrameData };
}

const convertResponse = (response: Response.Response): ResponseData => ({
  header: convertResponseHeader(response.header),
  body: ResponseBody.match(response.body, {
    onBegin: (begin) => ({ Begin: convertResponseBegin(begin) }),
    onFrame: (frame) => ({ Frame: convertResponseFrame(frame) }),
  }),
});

describe.concurrent("decode", () => {
  it.effect.prop(
    "decode response-header",
    { header: ResponseHeaderFromSelf },
    ({ header }, cx) =>
      Effect.gen(function* () {
        const input = convertResponseHeader(header);

        const array = yield* callDecode("response-header", input);
        const buffer = yield* Buffer.makeRead(new DataView(array.buffer));

        const received = yield* ResponseHeader.decode(buffer);

        cx.expect(Equal.equals(received, header)).toBeTruthy();
      }).pipe(Effect.provide(NodeContext.layer)),
  );

  it.effect.prop(
    "decode response-begin",
    { begin: ResponseBeginFromSelf },
    ({ begin }, cx) =>
      Effect.gen(function* () {
        const input = convertResponseBegin(begin);

        const array = yield* callDecode("response-begin", input);
        const buffer = yield* Buffer.makeRead(new DataView(array.buffer));

        const received = yield* ResponseBegin.decode(buffer);

        cx.expect(Equal.equals(received, begin)).toBeTruthy();
      }).pipe(Effect.provide(NodeContext.layer)),
  );

  it.effect.prop(
    "decode response-frame",
    { frame: ResponseFrameFromSelf },
    ({ frame }, cx) =>
      Effect.gen(function* () {
        const input = convertResponseFrame(frame);

        const array = yield* callDecode("response-frame", input);
        const buffer = yield* Buffer.makeRead(new DataView(array.buffer));

        const received = yield* ResponseFrame.decode(buffer);

        cx.expect(Equal.equals(received, frame)).toBeTruthy();
      }).pipe(Effect.provide(NodeContext.layer)),
  );

  it.effect.prop(
    "decode response",
    { response: ResponseFromSelf },
    ({ response: rawResponse }, cx) =>
      Effect.gen(function* () {
        // we first need to make sure that the response is properly formed (this is done either way during the encoding step)
        const response = Response.prepare(rawResponse);

        const input = convertResponse(Response.prepare(response));

        const array = yield* callDecode("response", input);
        const buffer = yield* Buffer.makeRead(new DataView(array.buffer));

        const received = yield* Response.decode(buffer);

        cx.expect(Equal.equals(received, response)).toBeTruthy();
      }).pipe(Effect.provide(NodeContext.layer)),
  );
});
