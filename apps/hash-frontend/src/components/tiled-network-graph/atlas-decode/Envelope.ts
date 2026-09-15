import * as Result from "./Result";
import * as TaggedError from "./TaggedError";

import type { Decoder, DecoderError, U16, U32 } from "./Decoder";

/** The supported binary envelope version. */
export const SALTILE_WIRE_VERSION = 1;

/** A rejected envelope prefix, directory or payload boundary. */
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
  | { readonly _tag: "invalid-layout"; readonly detail: string }
  | { readonly _tag: "decode" };

/** An envelope validation failure with an optional underlying read error. */
export class EnvelopeError extends TaggedError.TaggedError<
  "EnvelopeError",
  EnvelopeErrorReason
> {
  /** Describes the rejected prefix or directory. */
  constructor(reason: EnvelopeErrorReason, options?: ErrorOptions) {
    let message: string;

    switch (reason._tag) {
      case "invalid-kind":
        message = `invalid kind: ${reason.actual}, expected ${reason.expected.join(", ")}`;
        break;
      case "invalid-version":
        message = `invalid version: ${reason.actual}, expected ${reason.expected}`;
        break;
      case "invalid-layout":
        message = reason.detail;
        break;
      case "decode":
        message = "unable to decode envelope";
        break;
    }

    super("EnvelopeError", reason, message, options);
  }
}

/** The validated prefix shared by tile, edges and locate documents. */
export interface Envelope {
  readonly kind: "SALTILEE" | "SALTILEL" | "SALTILET";
  readonly version: U16;
  readonly flags: U16;
  readonly slots: U16;
  readonly reserved: U16;
}

/** A directory entry with a borrowed payload, or null for an absent section. */
export interface Chunk<T extends ArrayBufferLike> {
  readonly start: U32;
  readonly end: U32;
  readonly bytes: Uint8Array<T> | null;
}

/** Returns a directory or prefix validation error. */
const invalidLayout = (detail: string): Result.Result<never, EnvelopeError> =>
  Result.err(new EnvelopeError({ _tag: "invalid-layout", detail }));

/**
 * Validates an envelope and borrows its directory-addressed payloads.
 *
 * The decoder must start at offset zero. Successful decoding leaves its cursor after the last padded payload, where an optional trailer begins. Unknown appended slots are validated and retained. Only (0, 0) denotes absence; a nonzero empty range produces an empty byte view.
 *
 * Returns {@link EnvelopeError} for an unsupported prefix, invalid directory, nonzero padding or a read outside the input. Payload contents and trailer contents are left to the document decoder. Failure may advance the cursor.
 */
export const decode = <T extends ArrayBufferLike>(decoder: Decoder<T>) =>
  Result.gen(function* decodeEnvelope(): Result.gen.Return<
    readonly [envelope: Envelope, slots: readonly Chunk<T>[]],
    EnvelopeError | DecoderError
  > {
    if (decoder.offset !== 0) {
      return yield* invalidLayout("envelope decoding requires offset zero");
    }

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

    if (flags !== 0 || reserved !== 0) {
      return yield* invalidLayout(
        "envelope flags and reserved bits must be zero",
      );
    }

    const minimumSlots = kind === "SALTILEE" ? 4 : kind === "SALTILET" ? 5 : 7;
    if (slots < minimumSlots) {
      return yield* invalidLayout(
        `${kind} requires at least ${minimumSlots} slots, received ${slots}`,
      );
    }

    const chunks: Chunk<T>[] = [];

    let nextStart = 16 + 8 * slots;
    for (let slot = 0; slot < slots; slot += 1) {
      const start = yield* decoder.nextU32();
      const end = yield* decoder.nextU32();

      if (start === 0 && end === 0) {
        if (slot === 0) {
          return yield* invalidLayout("head slot must be present");
        }

        chunks.push({ start, end, bytes: null });
        continue;
      }

      if (start !== nextStart || end < start) {
        return yield* invalidLayout(
          `slot ${slot} must start at ${nextStart} and end at or after its start`,
        );
      }

      const bytes = yield* decoder.uint8Array(start, end - start);
      nextStart = Math.ceil(end / 8) * 8;

      const padding = yield* decoder.uint8Array(end, nextStart - end);
      if (padding.some((byte) => byte !== 0)) {
        return yield* invalidLayout(`slot ${slot} has nonzero padding`);
      }

      chunks.push({ start, end, bytes });
    }

    yield* decoder.seek(nextStart);
    return [{ kind, version, flags, slots, reserved }, chunks];
  }).pipe(
    Result.changeContextIf(
      TaggedError.is("DecoderError"),
      () => new EnvelopeError({ _tag: "decode" }),
    ),
  );
