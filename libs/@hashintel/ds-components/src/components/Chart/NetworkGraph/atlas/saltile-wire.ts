/**
 * Envelope layer of the SALTILE binary wire, the atlas serving API's
 * response encoding. The normative contract is
 * `libs/@local/graph/atlas/SPEC-ADDENDUM-WIRE.md`; agreement with the
 * Rust encoder is proven by shared fixture bytes, never asserted.
 *
 * A response is a 16-byte prefix followed by self-delimiting sections.
 * Every section header and payload starts 8-byte aligned, so column
 * payloads are viewed as typed arrays in place - the decoder never
 * copies point data.
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

/** Byte length of the response prefix (magic u64, version u16, flags u16, reserved u32). */
export const PREFIX_BYTES = 16;
/** Byte length of a section header (id u16, flags u16, byteLen u32). */
export const SECTION_HEADER_BYTES = 8;
/** Alignment of every section header and payload start. */
export const SECTION_ALIGNMENT = 8;

/** Section ids of the v1 registry. */
export const SectionId = {
  Head: 0x0001,
  Positions: 0x0010,
  RowIds: 0x0011,
  ColorIndex: 0x0012,
  /** Reserved for the enshrined mass channel; ships nothing in v1. */
  Mass: 0x0013,
  EdgeSources: 0x0020,
  EdgeTargets: 0x0021,
  EdgeRowIds: 0x0022,
  Trailer: 0x00ff,
} as const;

export type SectionId = (typeof SectionId)[keyof typeof SectionId];

/** Section-header flag marking a section a decoder may skip unrecognized. */
export const SECTION_FLAG_OPTIONAL = 0x0001;

/** Tile delivery mode carried by HEAD key 3. */
export const SaltileMode = {
  Delta: 0,
  Total: 1,
} as const;

export type SaltileMode = (typeof SaltileMode)[keyof typeof SaltileMode];

/** One decoded section boundary: payload located, nothing interpreted. */
export interface SaltileSection {
  readonly id: number;
  readonly flags: number;
  /** Absolute byte offset of the payload within the response buffer. */
  readonly payloadOffset: number;
  /** Unpadded payload byte length. */
  readonly byteLength: number;
}

/** Envelope structure of one response: kind, version, section table. */
export interface SaltileEnvelope {
  readonly kind: SaltileKind;
  readonly wireVersion: number;
  readonly sections: readonly SaltileSection[];
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

/**
 * Locates every section of a SALTILE response and validates the envelope
 * grammar: magic and kind, wire version, zero reserved bits, section
 * ordering (HEAD first, columns ascending, TRAILER last), single
 * occurrence per id, zero padding bytes, and exact buffer coverage.
 *
 * Section payloads are located, not interpreted; schema validation
 * belongs to the per-kind decoders layered above.
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
  if (view.getUint32(12, true) !== 0) {
    return fail("prefix reserved bytes must be zero", 12);
  }

  const sections: SaltileSection[] = [];
  const seen = new Set<number>();
  let cursor = PREFIX_BYTES;

  while (cursor < buffer.byteLength) {
    if (cursor + SECTION_HEADER_BYTES > buffer.byteLength) {
      return fail("response ends inside a section header", cursor);
    }
    const id = view.getUint16(cursor, true);
    const flags = view.getUint16(cursor + 2, true);
    const byteLength = view.getUint32(cursor + 4, true);
    if (flags !== 0 && flags !== SECTION_FLAG_OPTIONAL) {
      return fail(
        `section 0x${id.toString(16)} carries reserved flag bits`,
        cursor + 2,
      );
    }
    if (seen.has(id)) {
      return fail(`section 0x${id.toString(16)} occurs twice`, cursor);
    }
    seen.add(id);

    if (sections.length === 0 && id !== SectionId.Head) {
      return fail("the first section must be HEAD", cursor);
    }
    const previous = sections.at(-1);
    if (previous !== undefined && previous.id === SectionId.Trailer) {
      return fail("TRAILER must be the last section", cursor);
    }
    if (
      previous !== undefined &&
      previous.id !== SectionId.Head &&
      id !== SectionId.Trailer &&
      id <= previous.id
    ) {
      return fail(
        `section 0x${id.toString(16)} breaks ascending column order`,
        cursor,
      );
    }

    const payloadOffset = cursor + SECTION_HEADER_BYTES;
    if (payloadOffset + byteLength > buffer.byteLength) {
      return fail("response ends inside a section payload", payloadOffset);
    }
    const padded =
      Math.ceil(byteLength / SECTION_ALIGNMENT) * SECTION_ALIGNMENT;
    if (payloadOffset + padded > buffer.byteLength) {
      return fail(
        "response ends inside section padding",
        payloadOffset + byteLength,
      );
    }
    for (let index = byteLength; index < padded; index += 1) {
      if (bytes[payloadOffset + index] !== 0) {
        return fail("padding bytes must be zero", payloadOffset + index);
      }
    }

    sections.push({ id, flags, payloadOffset, byteLength });
    cursor = payloadOffset + padded;
  }

  if (sections.length === 0) {
    return fail(
      "response carries no sections; HEAD is mandatory",
      PREFIX_BYTES,
    );
  }

  return { kind, wireVersion, sections };
};
