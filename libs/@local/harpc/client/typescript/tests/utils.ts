import { Command, Path } from "@effect/platform";
import { Effect } from "effect";

const packageDirectory = () =>
  Effect.gen(function* () {
    const path = yield* Path.Path;

    const filePath = yield* path.fromFileUrl(new URL(import.meta.url));
    const testDirectory = path.dirname(filePath);

    return path.resolve(testDirectory, "..");
  });

const executablePath = () =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const directory = yield* packageDirectory();

    return path.resolve(
      directory,
      "..",
      "..",
      "wire-protocol/dist/release/codec",
    );
  });

export const assertEncode = (
  mode: "request-header" | "request-begin" | "request-frame" | "request",
  encoded: Uint8Array,
) =>
  Effect.gen(function* () {
    const binary = yield* executablePath();

    const buffer = Buffer.from(encoded);
    const base64 = buffer.toString("base64");

    const command = Command.make(binary, "encode", mode, base64);
    const output = yield* Command.string(command);

    const received = JSON.parse(output) as unknown;

    return received;
  });

export const assertDecode = <T>(
  mode: "response-header" | "response-begin" | "response-frame" | "response",
  payload: T,
) =>
  Effect.gen(function* () {
    const binary = yield* executablePath();

    const json = JSON.stringify(payload);

    const command = Command.make(binary, "decode", mode, json);
    const output = yield* Command.string(command);

    // convert base64 to Uint8Array
    const buffer = Buffer.from(output, "base64");
    return Uint8Array.from(buffer);
  });
