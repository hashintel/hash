/**
 * Envelope layer of the SALTILE binary wire, the atlas serving API's
 * response encoding. The normative contract is
 * `libs/@local/graph/atlas/SPEC-ADDENDUM-WIRE.md`; agreement with the
 * Rust encoder is proven by shared fixture bytes, never asserted.
 *
 * A response is a 16-byte prefix, a fixed offset directory of
 * `slotCount` (start, end) pairs, payloads sequential in slot order,
 * and an optional self-delimiting CBOR trailer tail after the last
 * payload. The directory gives random access to any payload with zero
 * parsing; every payload starts 8-byte aligned, so columns are viewed
 * as typed arrays in place - the decoder never copies point data.
 *
 * Slot meanings are frozen per (kind, wireVersion) and evolution
 * appends: a decoder reads the slots it supports and ignores the rest,
 * so a populated slot it does not consume costs nothing.
 */

/** Response kind, discriminated by the magic's eighth byte. */
export type SaltileKind = "tile" | "edges" | "locate";

/** Seven-byte magic family prefix, "SALTILE" in ASCII. */
const magicFamily = [0x53, 0x41, 0x4c, 0x54, 0x49, 0x4c, 0x45] as const;

/** Kind discriminators: ASCII initials in the magic's eighth byte. */
const kindBytes: Readonly<Record<SaltileKind, number>> = {
  tile: 0x54, // "T"
  edges: 0x45, // "E"
  locate: 0x4c, // "L"
};

export const SALTILE_MEDIA_TYPE = "application/vnd.hash.saltile-v1";
export const SALTILE_WIRE_VERSION = 1;

/** Byte length of the prefix (magic u64, version u16, flags u16, slotCount u16, reserved u16). */
export const PREFIX_BYTES = 16;
/** Byte length of one directory entry (start u32, end u32). */
export const DIRECTORY_ENTRY_BYTES = 8;
/** Alignment of every payload start. */
export const PAYLOAD_ALIGNMENT = 8;

/** Tile slot table (v1). */
export const TileSlot = {
  Head: 0,
  Positions: 1,
  RowIds: 2,
  TypeMask: 3,
  /** Reserved for the enshrined mass channel; (0, 0) in v1. */
  Mass: 4,
} as const;

/** Edges slot table (v1). */
export const EdgesSlot = {
  Head: 0,
  Sources: 1,
  Targets: 2,
  RowIds: 3,
} as const;

/** Minimum slotCount per kind: the v1 table sizes. */
const minimumSlots: Readonly<Record<SaltileKind, number>> = {
  tile: 5,
  edges: 4,
  locate: 1,
};

/** Tile delivery mode carried by the HEAD. */
export const SaltileMode = {
  Delta: 0,
  Total: 1,
} as const;

export type SaltileMode = (typeof SaltileMode)[keyof typeof SaltileMode];

/** One present payload extent; `end` is exclusive and unpadded. */
export interface SaltileSlot {
  readonly start: number;
  readonly end: number;
}

/** Envelope structure of one response. */
export interface SaltileEnvelope {
  readonly kind: SaltileKind;
  readonly wireVersion: number;
  /** Directory in slot order; null marks an absent (0, 0) slot. */
  readonly slots: readonly (SaltileSlot | null)[];
  /** 8-aligned offset after the last present payload, where a trailer tail may begin. */
  readonly tailOffset: number;
}

/** A response body violated the SALTILE envelope contract. */
export class SaltileWireError extends Error {
  override readonly name = "SaltileWireError";
  /** Byte offset at which the violated check applies. */
  readonly offset: number;

  constructor(detail: string, offset: number) {
    super(`${detail} (at byte ${offset})`);
    this.offset = offset;
  }
}

const fail = (detail: string, offset: number): never => {
  throw new SaltileWireError(detail, offset);
};

const kindOfByte = (byte: number): SaltileKind | undefined =>
  byte === kindBytes.tile
    ? "tile"
    : byte === kindBytes.edges
      ? "edges"
      : byte === kindBytes.locate
        ? "locate"
        : undefined;

const align8 = (offset: number): number =>
  Math.ceil(offset / PAYLOAD_ALIGNMENT) * PAYLOAD_ALIGNMENT;

/**
 * Validates the prefix and offset directory of a SALTILE response:
 * magic and kind, wire version, zero reserved bits, slot count at
 * least the kind's table size, HEAD present, present slots strictly
 * sequential and 8-aligned with zero padding bytes between payloads.
 *
 * Payloads are located, not interpreted; slot meaning, presence
 * requirements, and the trailer tail belong to the per-kind decoders
 * layered above.
 *
 * @throws {@link SaltileWireError} on the first violated check.
 */
export const readEnvelope = (
  buffer: ArrayBuffer,
  expectedKind: SaltileKind,
): SaltileEnvelope => {
  if (buffer.byteLength < PREFIX_BYTES) {
    return fail(
      `response is ${buffer.byteLength} bytes; the prefix requires ${PREFIX_BYTES}`,
      0,
    );
  }

  const bytes = new Uint8Array(buffer);
  for (const [index, expected] of magicFamily.entries()) {
    if (bytes[index] !== expected) {
      return fail("magic does not begin with the SALTILE family", index);
    }
  }

  const kind = kindOfByte(bytes[7]!);
  if (kind === undefined) {
    return fail(`unknown kind byte 0x${bytes[7]!.toString(16)}`, 7);
  }
  if (kind !== expectedKind) {
    return fail(
      `response kind is ${kind}; the request expects ${expectedKind}`,
      7,
    );
  }

  const view = new DataView(buffer);
  const wireVersion = view.getUint16(8, true);
  if (wireVersion !== SALTILE_WIRE_VERSION) {
    return fail(
      `wire version is ${wireVersion}; this decoder speaks ${SALTILE_WIRE_VERSION}`,
      8,
    );
  }
  if (view.getUint16(10, true) !== 0) {
    return fail("prefix flags must be zero", 10);
  }
  const slotCount = view.getUint16(12, true);
  if (view.getUint16(14, true) !== 0) {
    return fail("prefix reserved bytes must be zero", 14);
  }
  if (slotCount < minimumSlots[kind]) {
    return fail(
      `slot count ${slotCount} is below the ${kind} table size ${minimumSlots[kind]}`,
      12,
    );
  }

  const payloadBase = PREFIX_BYTES + slotCount * DIRECTORY_ENTRY_BYTES;
  if (buffer.byteLength < payloadBase) {
    return fail("response ends inside the directory", buffer.byteLength);
  }

  const slots: (SaltileSlot | null)[] = [];
  let expectedStart = payloadBase;

  for (let slot = 0; slot < slotCount; slot += 1) {
    const entryOffset = PREFIX_BYTES + slot * DIRECTORY_ENTRY_BYTES;
    const start = view.getUint32(entryOffset, true);
    const end = view.getUint32(entryOffset + 4, true);

    if (start === 0 && end === 0) {
      slots.push(null);
      continue;
    }
    if (end < start) {
      return fail(`slot ${slot} ends before it starts`, entryOffset);
    }
    if (start !== expectedStart) {
      return fail(
        `slot ${slot} starts at ${start}; the sequential layout requires ${expectedStart}`,
        entryOffset,
      );
    }
    if (end > buffer.byteLength) {
      return fail(`slot ${slot} extends beyond the response`, entryOffset);
    }
    for (let cursor = end; cursor < align8(end); cursor += 1) {
      if (cursor >= buffer.byteLength) {
        return fail("response ends inside payload padding", cursor);
      }
      if (bytes[cursor] !== 0) {
        return fail("padding bytes must be zero", cursor);
      }
    }

    slots.push({ start, end });
    expectedStart = align8(end);
  }

  if (slots[0] === null) {
    return fail("slot 0 (HEAD) must be present", PREFIX_BYTES);
  }

  return { kind, wireVersion, slots, tailOffset: expectedStart };
};
