import * as Option from "./Option";
import * as Result from "./Result";
import * as TaggedError from "./TaggedError";

import type * as Decoder from "./Decoder";

export const SALTILE_MEDIA_TYPE = "application/vnd.hash.saltile-v1";

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
  | { readonly _tag: "missing-slot"; readonly slot: number }
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
      case "missing-slot":
        message = `required envelope slot ${reason.slot} is absent`;
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

  static missingSlot(slot: number): EnvelopeError {
    return new EnvelopeError({ _tag: "missing-slot", slot });
  }
}

/** The validated prefix shared by tile, edges and locate documents. */
export interface Envelope {
  readonly kind: "SALTILEE" | "SALTILEL" | "SALTILET";
  readonly version: Decoder.U16;
  readonly flags: Decoder.U16;
  readonly slots: Decoder.U16;
  readonly reserved: Decoder.U16;
}

/**
 * A payload's byte range and borrowed view within an envelope.
 *
 * An absent section has zero offsets and null bytes. A present section may have an empty view, as in a zero-row column. Keep the input buffer attached and unchanged while using the view.
 */
export interface Chunk<T extends ArrayBufferLike> {
  readonly start: Decoder.U32;
  readonly end: Decoder.U32;
  readonly bytes: Uint8Array<T> | null;
}

/** Borrows an optional payload, preserving present-empty columns. */
export const getChunk = <T extends ArrayBufferLike>(
  chunks: readonly Chunk<T>[],
  index: number,
): Option.Option<Uint8Array<T>> => Option.fromNullable(chunks[index]?.bytes);

/** Borrows a required payload or identifies the absent slot. */
export const indexChunk = <T extends ArrayBufferLike>(
  chunks: readonly Chunk<T>[],
  index: number,
): Result.Result<Uint8Array<T>, EnvelopeError> =>
  Option.match(getChunk(chunks, index), {
    onSome: (bytes) => Result.ok(bytes),
    onNone: () => Result.err(EnvelopeError.missingSlot(index)),
  });

/** Returns a directory or prefix validation error. */
const invalidLayout = (detail: string): Result.Result<never, EnvelopeError> =>
  Result.err(new EnvelopeError({ _tag: "invalid-layout", detail }));

/** A validated prefix and its payloads in directory order. */
export type DecodedEnvelope<T extends ArrayBufferLike> = readonly [
  envelope: Envelope,
  slots: readonly Chunk<T>[],
];

/** Reads the common framing without interpreting individual payload contents. */
const readEnvelope = Result.fn(function* readEnvelope<
  T extends ArrayBufferLike,
>(
  decoder: Decoder.Decoder<T>,
): Result.gen.Return<DecodedEnvelope<T>, EnvelopeError | Decoder.DecoderError> {
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

  const minimumSlots = { SALTILEE: 4, SALTILET: 5, SALTILEL: 7 }[kind];
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
});

/**
 * Decodes the common framing of tile, edges and locate responses.
 *
 * The returned {@link Chunk} views keep payload contents encoded for their document-specific decoder. Additional directory slots are included, even when their meaning is unknown.
 *
 * Supply a decoder at offset zero. On success, its next unread byte begins the document's trailer, if one follows. Failure may advance the cursor.
 *
 * @returns A {@link DecodedEnvelope} or an {@link EnvelopeError} for malformed framing. Underlying read errors and unexpected exceptions are retained as causes.
 */
export const decode = <T extends ArrayBufferLike>(
  decoder: Decoder.Decoder<T>,
): Result.Result<DecodedEnvelope<T>, EnvelopeError> =>
  Result.catch(
    () => readEnvelope(decoder),
    (cause) => Result.err(new EnvelopeError({ _tag: "decode" }, { cause })),
  ).pipe(
    Result.changeContextIf(
      TaggedError.is("DecoderError"),
      () => new EnvelopeError({ _tag: "decode" }),
    ),
  );
