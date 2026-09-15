import * as Result from "./Result";
import * as TaggedError from "./TaggedError";

import type { Decoder, DecoderError, U16, U32 } from "./Decoder";

export const SALTILE_WIRE_VERSION = 1;

export type EnvelopeErrorReason =
  | {
      readonly _tag: "invalid-kind";

      readonly actual: string;
      readonly expected: readonly string[];
    }
  | {
      readonly _tag: "invalid-version";

      readonly actual: number;
      readonly expected: number;
    }
  | {
      readonly _tag: "decode";
    };

export class EnvelopeError extends TaggedError.TaggedError<"EnvelopeError"> {
  reason: EnvelopeErrorReason;
  cause?: unknown;

  constructor(reason: EnvelopeErrorReason, options?: ErrorOptions) {
    super("EnvelopeError", "unable to decode envelope", options);

    this.reason = reason;
  }

  get message(): string {
    switch (this.reason._tag) {
      case "invalid-kind":
        return `Invalid kind: ${this.reason.actual}, expected one of ${this.reason.expected.join(", ")}`;
      case "invalid-version":
        return `Invalid version: ${this.reason.actual}, expected ${this.reason.expected}`;
      case "decode":
        return "Unable to decode envelope";
    }
  }
}

export interface Envelope {
  readonly kind: "SALTILEE" | "SALTILEL" | "SALTILET";
  readonly version: U16;
  readonly flags: U16;
  readonly slots: U16;
  readonly reserved: U16;
}

export interface Chunk {
  readonly start: U32;
  readonly end: U32;
  readonly bytes: Uint8Array | null;
}

export const decode = <T extends ArrayBufferLike>(decoder: Decoder<T>) =>
  Result.gen(function* (): Result.gen.Return<
    readonly [envelope: Envelope, slots: readonly Chunk[]],
    EnvelopeError | DecoderError
  > {
    const kind = yield* decoder.nextString(8);
    const version = yield* decoder.nextU16();
    const flags = yield* decoder.nextU16();
    const slots = yield* decoder.nextU16();
    const reserved = yield* decoder.nextU16();

    if (kind !== "SALTILEE" && kind !== "SALTILEL" && kind !== "SALTILET") {
      return yield* Result.err(
        new EnvelopeError({
          _tag: "invalid-kind",
          actual: kind,
          expected: ["SALTILEE", "SALTILEL", "SALTILET"],
        }),
      );
    }

    if (version !== SALTILE_WIRE_VERSION) {
      return yield* Result.err(
        new EnvelopeError({
          _tag: "invalid-version",
          actual: version,
          expected: SALTILE_WIRE_VERSION,
        }),
      );
    }

    const chunks: Chunk[] = [];
    for (let offset = 0; offset < slots; offset++) {
      const start = yield* decoder.nextU32();
      const end = yield* decoder.nextU32();
      if (start === end) {
        chunks.push({ start, end, bytes: null });
      } else {
        const chunk = yield* decoder.uint8Array(start, end - start);
        chunks.push({ start, end, bytes: chunk });
      }
    }

    return [
      {
        kind,
        version,
        flags,
        slots,
        reserved,
      },
      chunks,
    ];
  }).pipe(
    Result.changeContextIf(
      TaggedError.is("DecoderError"),
      (error) => new EnvelopeError({ _tag: "decode" }, { cause: error }),
    ),
  );
