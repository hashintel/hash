import { describe, expect, it } from "vitest";

import { Decoder, DecoderError } from "./Decoder";
import {
  decode,
  EnvelopeError,
  getChunk,
  indexChunk,
  SALTILE_WIRE_VERSION,
  type Chunk,
} from "./Envelope";
import { buildResponse } from "./fixtures";
import * as Option from "./Option";
import * as Result from "./Result";
import { DIRECTORY_ENTRY_BYTES, PREFIX_BYTES, type SaltileKind } from "./wire";

const align8 = (value: number): number => Math.ceil(value / 8) * 8;

const decoderOf = (buffer: ArrayBuffer): Decoder<ArrayBuffer> =>
  new Decoder(new DataView(buffer));

/** A well-formed 5-slot tile skeleton: HEAD + two columns, MASS and TYPE_MASK absent. */
const tileSkeleton = (): (number[] | null)[] => [
  [0xa0],
  Array.from({ length: 24 }, () => 1),
  Array.from({ length: 12 }, () => 2),
  null,
  null,
];

/** Returns the byte offset of a slot's directory entry. */
const entryOffset = (slot: number): number =>
  PREFIX_BYTES + slot * DIRECTORY_ENTRY_BYTES;

/** Narrows a Result to its Err and returns the error. */
const expectErr = <E>(result: Result.Result<unknown, E>): E => {
  expect(result._tag).toBe("err");
  if (!Result.isErr(result)) {
    throw new Error("expected an Err");
  }
  return result.error;
};

/** Narrows a Result to its Ok and returns the value. */
const expectOk = <T>(result: Result.Result<T, unknown>): T => {
  expect(result._tag).toBe("ok");
  if (!Result.isOk(result)) {
    throw new Error("expected an Ok");
  }
  return result.value;
};

describe("Envelope chunk lookup", () => {
  it("payload_borrowed", () => {
    const [, chunks] = expectOk(
      decode(decoderOf(buildResponse("tile", tileSkeleton()))),
    );
    const bytes = expectOk(indexChunk(chunks, 1));
    expect(bytes).toBe(chunks[1]?.bytes);
    const optional = getChunk(chunks, 1);
    expect(Option.isSome(optional)).toBe(true);
    if (Option.isSome(optional)) {
      expect(optional.value).toBe(bytes);
    }
  });

  it.each([3, 9, -1, 0.5, NaN])("absent_slot_%s", (slot) => {
    const [, chunks] = expectOk(
      decode(decoderOf(buildResponse("tile", tileSkeleton()))),
    );
    expect(getChunk(chunks, slot)).toEqual(Option.none());
    const error = expectErr(indexChunk(chunks, slot));
    expect(error).toBeInstanceOf(EnvelopeError);
    expect(error.reason).toEqual({ _tag: "missing-slot", slot });
  });

  it("present_empty", () => {
    const payloads = tileSkeleton();
    payloads[3] = [];
    const [, chunks] = expectOk(
      decode(decoderOf(buildResponse("tile", payloads))),
    );
    expect(Option.isSome(getChunk(chunks, 3))).toBe(true);
    expect(expectOk(indexChunk(chunks, 3))).toHaveLength(0);
  });
});

describe("Envelope.decode success", () => {
  it("present_and_absent_slots", () => {
    const decoder = decoderOf(buildResponse("tile", tileSkeleton()));
    const [envelope, chunks] = expectOk(decode(decoder));

    expect(envelope.kind).toBe("SALTILET");
    expect(envelope.version).toBe(SALTILE_WIRE_VERSION);
    expect(envelope.flags).toBe(0);
    expect(envelope.reserved).toBe(0);
    expect(envelope.slots).toBe(5);

    expect(chunks).toHaveLength(5);
    expect(chunks[0]).toMatchObject({ start: 56, end: 57 });
    expect(chunks[0]?.bytes).toHaveLength(1);
    expect(chunks[1]).toMatchObject({ start: 64, end: 88 });
    expect(chunks[1]?.bytes).toHaveLength(24);
    expect(chunks[2]).toMatchObject({ start: 88, end: 100 });
    expect(chunks[2]?.bytes).toHaveLength(12);
    expect(chunks[3]).toEqual({ start: 0, end: 0, bytes: null });
    expect(chunks[4]).toEqual({ start: 0, end: 0, bytes: null });
  });

  it("borrows_payload_bytes", () => {
    const buffer = buildResponse("tile", tileSkeleton());
    const decoder = decoderOf(buffer);
    const [, chunks] = expectOk(decode(decoder));

    const positions: Chunk<ArrayBuffer> = chunks[1]!;
    expect(positions.bytes?.buffer).toBe(buffer);

    // Not a copy: mutating the source buffer is visible on the chunk.
    new Uint8Array(buffer)[positions.start] = 0xfe;
    expect(positions.bytes?.[0]).toBe(0xfe);
  });

  it.each([
    { kind: "tile" as SaltileKind, magic: "SALTILET", minimum: 5 },
    { kind: "edges" as SaltileKind, magic: "SALTILEE", minimum: 4 },
    { kind: "locate" as SaltileKind, magic: "SALTILEL", minimum: 7 },
  ])("decodes_$kind_at_minimum", ({ kind, magic, minimum }) => {
    const payloads: (number[] | null)[] = [
      [0xa0],
      ...Array.from({ length: minimum - 1 }, () => null),
    ];
    const decoder = decoderOf(buildResponse(kind, payloads));
    const [envelope, chunks] = expectOk(decode(decoder));

    expect(envelope.kind).toBe(magic);
    expect(envelope.slots).toBe(minimum);
    expect(chunks).toHaveLength(minimum);
    expect(chunks[0]?.bytes).toHaveLength(1);
    for (let slot = 1; slot < minimum; slot += 1) {
      expect(chunks[slot]).toEqual({ start: 0, end: 0, bytes: null });
    }
  });

  it("distinguishes_present_empty_from_absent", () => {
    const payloads = tileSkeleton();
    payloads[1] = [];
    payloads[2] = [];
    const decoder = decoderOf(buildResponse("tile", payloads));
    const [, chunks] = expectOk(decode(decoder));

    expect(chunks[1]).toMatchObject({ start: 64, end: 64 });
    expect(chunks[1]?.bytes).toHaveLength(0);
    expect(chunks[1]?.bytes).not.toBeNull();
    expect(chunks[2]).toMatchObject({ start: 64, end: 64 });
    expect(chunks[2]?.bytes).not.toBeNull();
    expect(chunks[3]).toEqual({ start: 0, end: 0, bytes: null });
  });

  it("accepts_appended_slot_beyond_v1", () => {
    const payloads = [...tileSkeleton(), [9, 9, 9, 9]];
    const decoder = decoderOf(buildResponse("tile", payloads));
    const [envelope, chunks] = expectOk(decode(decoder));

    expect(envelope.slots).toBe(6);
    expect(chunks).toHaveLength(6);
    expect(chunks[3]).toEqual({ start: 0, end: 0, bytes: null });
    expect(chunks[4]).toEqual({ start: 0, end: 0, bytes: null });

    const appended: Chunk<ArrayBuffer> = chunks[5]!;
    expect(appended.bytes).toHaveLength(4);
    // The appended slot still obeys the sequential-placement rule, picking
    // up right after slot 2's padded end (3 and 4 are absent and do not
    // move the cursor).
    expect(appended.start).toBe(align8(chunks[2]!.end));
    // Cursor position before the trailer: with no explicit tail bytes, the
    // buffer ends exactly at the appended slot's aligned end.
    expect(decoder.offset).toBe(align8(appended.end));
    expect(decoder.offset).toBe(decoder.byteLength);
  });

  it("cursor_at_aligned_end", () => {
    const decoder = decoderOf(buildResponse("tile", tileSkeleton()));
    expectOk(decode(decoder));
    expect(decoder.offset).toBe(104);
  });

  it("cursor_stops_before_trailer", () => {
    const decoder = decoderOf(
      buildResponse("tile", tileSkeleton(), [0xaa, 0xbb]),
    );
    expectOk(decode(decoder));
    expect(decoder.offset).toBe(104);
    expect(expectOk(decoder.nextU8())).toBe(0xaa);
    expect(expectOk(decoder.nextU8())).toBe(0xbb);
  });
});

describe("Envelope.decode prefix rejections", () => {
  it("rejects_nonzero_offset", () => {
    const decoder = decoderOf(buildResponse("tile", tileSkeleton()));
    expectOk(decoder.seek(1));
    const error = expectErr(decode(decoder));
    expect(error).toBeInstanceOf(EnvelopeError);
    expect(error.reason).toEqual({
      _tag: "invalid-layout",
      detail: "envelope decoding requires offset zero",
    });
    expect(decoder.offset).toBe(1);
  });

  it.each([
    { name: "kind_byte", index: 7, byte: 0x51 },
    { name: "family_byte", index: 0, byte: 0x58 },
  ])("rejects_unknown_kind_$name", ({ index, byte }) => {
    const buffer = buildResponse("tile", tileSkeleton());
    new Uint8Array(buffer)[index] = byte;
    const decoder = decoderOf(buffer);

    const error = expectErr(decode(decoder));
    expect(error.reason._tag).toBe("invalid-kind");
    if (error.reason._tag === "invalid-kind") {
      expect(error.reason.expected).toEqual([
        "SALTILEE",
        "SALTILEL",
        "SALTILET",
      ]);
    }
  });

  it("wraps_invalid_utf8_magic_as_decode", () => {
    const buffer = buildResponse("tile", tileSkeleton());
    new Uint8Array(buffer)[0] = 0xff;
    const decoder = decoderOf(buffer);

    const error = expectErr(decode(decoder));
    expect(error.reason).toEqual({ _tag: "decode" });
    expect(error.cause).toBeInstanceOf(DecoderError);
    expect((error.cause as DecoderError).reason._tag).toBe("invalid-string");
  });

  it("rejects_unsupported_version", () => {
    const buffer = buildResponse("tile", tileSkeleton());
    new DataView(buffer).setUint16(8, 2, true);
    const decoder = decoderOf(buffer);

    const error = expectErr(decode(decoder));
    expect(error.reason).toEqual({
      _tag: "invalid-version",
      actual: 2,
      expected: SALTILE_WIRE_VERSION,
    });
  });

  it.each([
    { name: "flags", byteIndex: 10 },
    { name: "reserved", byteIndex: 14 },
  ])("rejects_nonzero_$name", ({ byteIndex }) => {
    const buffer = buildResponse("tile", tileSkeleton());
    new Uint8Array(buffer)[byteIndex] = 1;
    const decoder = decoderOf(buffer);

    const error = expectErr(decode(decoder));
    expect(error.reason).toEqual({
      _tag: "invalid-layout",
      detail: "envelope flags and reserved bits must be zero",
    });
  });

  it("rejects_slot_count_below_minimum", () => {
    const decoder = decoderOf(
      buildResponse("tile", [[0xa0], null, null, null]),
    );
    const error = expectErr(decode(decoder));
    expect(error.reason).toEqual({
      _tag: "invalid-layout",
      detail: "SALTILET requires at least 5 slots, received 4",
    });
  });
});

describe("Envelope.decode directory rejections", () => {
  it("rejects_directory_gap", () => {
    const buffer = buildResponse("tile", tileSkeleton());
    new DataView(buffer).setUint32(entryOffset(1), 72, true);
    const decoder = decoderOf(buffer);

    const error = expectErr(decode(decoder));
    expect(error.reason).toEqual({
      _tag: "invalid-layout",
      detail: "slot 1 must start at 64 and end at or after its start",
    });
  });

  it("rejects_directory_overlap", () => {
    const buffer = buildResponse("tile", tileSkeleton());
    new DataView(buffer).setUint32(entryOffset(1), 60, true);
    const decoder = decoderOf(buffer);

    const error = expectErr(decode(decoder));
    expect(error.reason).toEqual({
      _tag: "invalid-layout",
      detail: "slot 1 must start at 64 and end at or after its start",
    });
  });

  it("rejects_end_before_start", () => {
    const buffer = buildResponse("tile", tileSkeleton());
    new DataView(buffer).setUint32(entryOffset(1) + 4, 32, true);
    const decoder = decoderOf(buffer);

    const error = expectErr(decode(decoder));
    expect(error.reason).toEqual({
      _tag: "invalid-layout",
      detail: "slot 1 must start at 64 and end at or after its start",
    });
  });

  it("wraps_out_of_bounds_extent_as_decode", () => {
    const buffer = buildResponse("tile", tileSkeleton());
    new DataView(buffer).setUint32(entryOffset(2) + 4, 999_999, true);
    const decoder = decoderOf(buffer);

    const error = expectErr(decode(decoder));
    expect(error.reason).toEqual({ _tag: "decode" });
    expect(error.cause).toBeInstanceOf(DecoderError);
    expect((error.cause as DecoderError).reason._tag).toBe("eof");
  });

  it("wraps_short_prefix_as_decode", () => {
    const decoder = decoderOf(new ArrayBuffer(5));
    const error = expectErr(decode(decoder));
    expect(error.reason).toEqual({ _tag: "decode" });
    expect(error.cause).toBeInstanceOf(DecoderError);
    expect((error.cause as DecoderError).reason._tag).toBe("eof");
  });

  it("rejects_nonzero_padding", () => {
    const buffer = buildResponse("tile", tileSkeleton());
    // Byte 60 lies within slot 0's padding region (57..64).
    new Uint8Array(buffer)[60] = 7;
    const decoder = decoderOf(buffer);

    const error = expectErr(decode(decoder));
    expect(error.reason).toEqual({
      _tag: "invalid-layout",
      detail: "slot 0 has nonzero padding",
    });
  });

  it("requires_head_slot_present", () => {
    const decoder = decoderOf(
      buildResponse("tile", [null, [1, 2, 3, 4], null, null, null]),
    );
    const error = expectErr(decode(decoder));
    expect(error.reason).toEqual({
      _tag: "invalid-layout",
      detail: "head slot must be present",
    });
  });
});

describe("Envelope error causes", () => {
  it("no_cause_for_layout_rejection", () => {
    const decoder = decoderOf(
      buildResponse("tile", [[0xa0], null, null, null]),
    );
    const error = expectErr(decode(decoder));
    expect(error.reason._tag).toBe("invalid-layout");
    expect(error.cause).toBeUndefined();
  });

  it("decoder_error_as_cause_for_decode", () => {
    const decoder = decoderOf(new ArrayBuffer(0));
    const error = expectErr(decode(decoder));
    expect(error.reason).toEqual({ _tag: "decode" });
    expect(error.cause).toBeInstanceOf(DecoderError);
  });
});
