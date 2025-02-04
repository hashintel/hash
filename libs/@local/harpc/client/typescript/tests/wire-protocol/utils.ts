import { Command, Path } from "@effect/platform";
import { Effect } from "effect";
import type * as vitest from "vitest";

const packageDirectory = Effect.fn("packageDirectory")(function* () {
  const path = yield* Path.Path;

  const filePath = yield* path.fromFileUrl(new URL(import.meta.url));
  const testDirectory = path.dirname(filePath);

  return path.resolve(testDirectory, "..");
});

const executablePath = Effect.fn("executablePath")(function* () {
  const path = yield* Path.Path;
  const directory = yield* packageDirectory();

  return path.resolve(
    directory,
    "..",
    "..",
    "..",
    "wire-protocol/dist/release/codec",
  );
});

export const callEncode = Effect.fn("callEncode")(function* (
  mode: "request-header" | "request-begin" | "request-frame" | "request",
  encoded: Uint8Array,
) {
  const binary = yield* executablePath();

  const buffer = Buffer.from(encoded);
  const base64 = buffer.toString("base64");

  const command = Command.make(binary, "encode", mode, base64);
  const output = yield* Command.string(command);

  const received = JSON.parse(output) as unknown;

  return received;
});

export const callDecode = Effect.fn("callDecode")(function* (
  mode: "response-header" | "response-begin" | "response-frame" | "response",
  payload: unknown,
) {
  const binary = yield* executablePath();

  const json = JSON.stringify(payload);

  const command = Command.make(binary, "decode", mode, json);
  const output = yield* Command.string(command);

  // convert base64 to Uint8Array
  const buffer = Buffer.from(output, "base64");

  return Uint8Array.from(buffer);
});

export const expectArrayBuffer = (
  cx: vitest.TaskContext<vitest.RunnerTestCase> & vitest.TestContext,
  value: ArrayBufferLike,
): ArrayBuffer => {
  cx.expect(value).toBeInstanceOf(ArrayBuffer);

  return value as ArrayBuffer;
};
