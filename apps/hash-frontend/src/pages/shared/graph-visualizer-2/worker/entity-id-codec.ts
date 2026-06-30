/**
 * Thread-agnostic codec for the EntityIdx -> EntityId join map's byte layout. The worker
 * (buffers/entity-id-buffer.ts) writes it; the main thread reads it on demand. One module
 * owns the packing so both sides agree on the layout: per record,
 * `webId (16) | entityUuid (16) | draftId (16)`, each UUID packed to 16 bytes, with the
 * draftId slot all-zero when the entity is not a draft.
 */
import {
  type DraftId,
  type EntityId,
  type EntityUuid,
  type WebId,
  entityIdFromComponents,
  splitEntityId,
} from "@blockprotocol/type-system";

/** Bytes per UUID (128 bits). */
const UUID_BYTES = 16;
/** Bytes per record: webId + entityUuid + draftId. */
export const ENTITY_ID_BYTES = UUID_BYTES * 3;
/** `version: int32`; also the byte offset where the records begin, so a reader builds a
 * records-region view with `new Uint8Array(raw, ID_HEADER_BYTES)`. */
export const ID_HEADER_BYTES = 4;
/** The draftId slot when the entity is not a draft. */
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

/** Pack a hyphenated UUID string into 16 bytes at `offset` (in place, zero-alloc). */
function writeUuid(target: Uint8Array, offset: number, uuid: string): void {
  const hex = uuid.replace(/-/g, "");
  for (let i = 0; i < UUID_BYTES; i++) {
    // Writing into the caller's buffer is the point; a fresh array per UUID would be a
    // perf nightmare.
    // eslint-disable-next-line no-param-reassign
    target[offset + i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
}

/** Reconstruct a hyphenated UUID string from 16 bytes at `offset`. */
function readUuid(source: Uint8Array, offset: number): string {
  let hex = "";
  for (let i = 0; i < UUID_BYTES; i++) {
    hex += source[offset + i]!.toString(16).padStart(2, "0");
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Write the EntityId for `entityIdx` into a records-region view: its webId, entityUuid,
 * and draftId (or a zeroed draftId slot when the entity is not a draft). */
export function encodeEntityId(
  bytes: Uint8Array,
  entityIdx: number,
  entityId: EntityId,
): void {
  const [webId, entityUuid, draftId] = splitEntityId(entityId);
  const base = entityIdx * ENTITY_ID_BYTES;
  writeUuid(bytes, base, webId);
  writeUuid(bytes, base + UUID_BYTES, entityUuid);
  writeUuid(bytes, base + UUID_BYTES * 2, draftId ?? ZERO_UUID);
}

/** Reconstruct the EntityId for `entityIdx` from a records-region view. */
export function decodeEntityId(bytes: Uint8Array, entityIdx: number): EntityId {
  const base = entityIdx * ENTITY_ID_BYTES;
  const webId = readUuid(bytes, base) as WebId;
  const entityUuid = readUuid(bytes, base + UUID_BYTES) as EntityUuid;
  const draftIdRaw = readUuid(bytes, base + UUID_BYTES * 2);
  const draftId =
    draftIdRaw === ZERO_UUID ? undefined : (draftIdRaw as DraftId);
  return entityIdFromComponents(webId, entityUuid, draftId);
}
