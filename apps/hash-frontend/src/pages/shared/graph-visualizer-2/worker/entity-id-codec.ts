/* eslint-disable no-bitwise, no-param-reassign */
/**
 * Codec for the EntityIdx to EntityId shared buffer.
 *
 * Per-record layout: `webId (16) | entityUuid (16) | draftId (16)`,
 * each UUID packed to 16 bytes. The draftId slot is all-zero when the
 * entity is not a draft.
 */

import {
  type DraftId,
  type EntityId,
  type EntityUuid,
  type WebId,
  entityIdFromComponents,
  splitEntityId,
} from "@blockprotocol/type-system";

const UUID_BYTES = 16;
/** Bytes per record: webId + entityUuid + draftId. */
export const ENTITY_ID_BYTES = UUID_BYTES * 3;
/** Byte offset where records begin (preceded by an int32 version counter). */
export const ID_HEADER_BYTES = 4;

/** Char code to 4-bit nibble value. Valid for '0'-'9', 'A'-'F', 'a'-'f'. */
// prettier-ignore
const HEX_VAL = new Uint8Array([
//  0  1  2  3  4  5  6  7  8  9  A  B  C  D  E  F
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0x00
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0x10
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0x20
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 0, 0, 0, 0, 0, // 0x30  '0'-'9'
    0,10,11,12,13,14,15, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0x40  'A'-'F'
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0x50
    0,10,11,12,13,14,15, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0x60  'a'-'f'
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0x70
]);

/** Byte value to two-char hex string. */
const BYTE_HEX: readonly string[] = Array.from({ length: 256 }, (_, i) =>
  i.toString(16).padStart(2, "0"),
);

const HYPHEN = 0x2d;

/** Pack a hyphenated UUID string into 16 bytes at `offset` in place. */
function writeUuid(target: Uint8Array, offset: number, uuid: string): void {
  let index = 0;
  for (let i = 0; i < UUID_BYTES; i++) {
    if (uuid.charCodeAt(index) === HYPHEN) {
      index += 1;
    }

    target[offset + i] =
      (HEX_VAL[uuid.charCodeAt(index)]! << 4) |
      HEX_VAL[uuid.charCodeAt(index + 1)]!;
    index += 2;
  }
}

/** Reconstruct a hyphenated UUID string from 16 bytes at `offset`. */
function readUuid(source: Uint8Array, offset: number): string {
  const b = (i: number): string => BYTE_HEX[source[offset + i]!]!;
  return `${b(0)}${b(1)}${b(2)}${b(3)}-${b(4)}${b(5)}-${b(6)}${b(7)}-${b(8)}${b(9)}-${b(10)}${b(11)}${b(12)}${b(13)}${b(14)}${b(15)}`;
}

/** Encode an {@link EntityId} at the given index. */
export function encodeEntityId(
  bytes: Uint8Array,
  entityIdx: number,
  entityId: EntityId,
): void {
  const [webId, entityUuid, draftId] = splitEntityId(entityId);
  const base = entityIdx * ENTITY_ID_BYTES;
  writeUuid(bytes, base, webId);
  writeUuid(bytes, base + UUID_BYTES, entityUuid);
  const draftOffset = base + UUID_BYTES * 2;
  if (draftId) {
    writeUuid(bytes, draftOffset, draftId);
  } else {
    bytes.fill(0, draftOffset, draftOffset + UUID_BYTES);
  }
}

function isZeroSlot(bytes: Uint8Array, offset: number): boolean {
  for (let i = 0; i < UUID_BYTES; i++) {
    if (bytes[offset + i] !== 0) {
      return false;
    }
  }
  return true;
}

/** Reconstruct the {@link EntityId} at the given index. */
export function decodeEntityId(bytes: Uint8Array, entityIdx: number): EntityId {
  const base = entityIdx * ENTITY_ID_BYTES;
  const webId = readUuid(bytes, base) as WebId;
  const entityUuid = readUuid(bytes, base + UUID_BYTES) as EntityUuid;
  const draftOffset = base + UUID_BYTES * 2;
  const isDraft = !isZeroSlot(bytes, draftOffset);
  const draftId = isDraft
    ? (readUuid(bytes, draftOffset) as DraftId)
    : undefined;
  return entityIdFromComponents(webId, entityUuid, draftId);
}
