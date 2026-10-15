import { NodeServices } from "@effect/platform-node";
import { describe, it } from "@effect/vitest";
import { Effect, Equal } from "effect";

import { MutableBuffer, MutableBytes } from "../../src/binary/index.js";
import { ResponseKind } from "../../src/types/index.js";
import {
  Response,
  ResponseBegin,
  ResponseBody,
  ResponseFlags,
  ResponseFrame,
  ResponseHeader,
} from "../../src/wire-protocol/models/response/index.js";
import { callDecode } from "./utils.js";

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

interface ResponseBeginData {
  kind: "Ok" | { Err: number };
  payload: number[];
}

const convertResponseBegin = (
  begin: ResponseBegin.ResponseBegin,
): ResponseBeginData => ({
  kind: ResponseKind.match(begin.kind, {
    onOk: () => "Ok",
    // eslint-disable-next-line unicorn/prevent-abbreviations
    onErr: (code) => ({ Err: code.value }),
  }),
  payload: [...begin.payload.buffer],
});

interface ResponseFrameData {
  payload: number[];
}

const convertResponseFrame = (
  frame: ResponseFrame.ResponseFrame,
): ResponseFrameData => ({
  payload: [...frame.payload.buffer],
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
    { header: ResponseHeader.arbitrary },
    ({ header }, cx) =>
      Effect.gen(function* () {
        const input = convertResponseHeader(header);

        const array = yield* callDecode("response-header", input);
        const buffer = MutableBuffer.makeRead(MutableBytes.from(array.buffer));

        const received = yield* Effect.fromResult(
          ResponseHeader.decode(buffer),
        );

        cx.expect(Equal.equals(received, header)).toBeTruthy();
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect.prop(
    "decode response-begin",
    { begin: ResponseBegin.arbitrary },
    ({ begin }, cx) =>
      Effect.gen(function* () {
        const input = convertResponseBegin(begin);

        const array = yield* callDecode("response-begin", input);
        const buffer = MutableBuffer.makeRead(MutableBytes.from(array.buffer));

        const received = yield* Effect.fromResult(ResponseBegin.decode(buffer));

        cx.expect(Equal.equals(received, begin)).toBeTruthy();
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect.prop(
    "decode response-frame",
    { frame: ResponseFrame.arbitrary },
    ({ frame }, cx) =>
      Effect.gen(function* () {
        const input = convertResponseFrame(frame);

        const array = yield* callDecode("response-frame", input);
        const buffer = MutableBuffer.makeRead(MutableBytes.from(array.buffer));

        const received = yield* Effect.fromResult(ResponseFrame.decode(buffer));

        cx.expect(Equal.equals(received, frame)).toBeTruthy();
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect.prop(
    "decode response",
    { response: Response.arbitrary },
    ({ response: rawResponse }, cx) =>
      Effect.gen(function* () {
        // we first need to make sure that the response is properly formed (this is done either way during the encoding step)
        const response = Response.prepare(rawResponse);

        const input = convertResponse(Response.prepare(response));

        const array = yield* callDecode("response", input);
        const buffer = MutableBuffer.makeRead(MutableBytes.from(array.buffer));

        const received = yield* Effect.fromResult(Response.decode(buffer));

        cx.expect(Equal.equals(received, response)).toBeTruthy();
      }).pipe(Effect.provide(NodeServices.layer)),
  );
});
