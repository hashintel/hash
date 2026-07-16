/**
 * HTTP and wire boundary for the active Atlas generation.
 *
 * Bootstrap values bind every tile request to one immutable release. The
 * module validates untyped JSON and binary responses before exposing them to
 * frontier or rendering code.
 */

import {
  ATLAS_MAX_TILE_ZOOM,
  ATLAS_WORLD_SIZE,
  atlasTileBounds,
  atlasTileChildren,
  atlasTileKey,
  validateAtlasTileCoordinate,
  type AtlasTileBounds,
  type AtlasTileCoordinate,
} from "./atlas-client/atlas-tile-coordinate";
import {
  ATLAS_TILE_MEDIA_TYPE,
  AtlasTileWireError,
  decodeAtlasTile,
  type DecodedAtlasTile,
} from "./atlas-client/decode-atlas-tile";

export {
  ATLAS_MAX_TILE_ZOOM,
  ATLAS_TILE_MEDIA_TYPE,
  ATLAS_WORLD_SIZE,
  atlasTileBounds,
  atlasTileChildren,
  atlasTileKey,
  validateAtlasTileCoordinate,
};
export type { AtlasTileBounds, AtlasTileCoordinate, DecodedAtlasTile };

const sha256Pattern = /^[0-9a-f]{64}$/u;

/** Failure categories surfaced by the demo's recoverable state machine. */
export type AtlasClientErrorKind =
  | "http"
  | "invalid-json"
  | "invalid-manifest"
  | "invalid-tile"
  | "network"
  | "no-active-generation"
  | "stale-generation";

/** A validated, user-actionable failure at the Atlas HTTP boundary. */
export class AtlasClientError extends Error {
  override readonly name = "AtlasClientError";
  readonly kind: AtlasClientErrorKind;
  readonly retryable: boolean;
  readonly status?: number;

  constructor(
    kind: AtlasClientErrorKind,
    message: string,
    options: {
      readonly cause?: unknown;
      readonly retryable?: boolean;
      readonly status?: number;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.kind = kind;
    this.retryable = options.retryable ?? true;
    this.status = options.status;
  }
}

/** Immutable bootstrap state required to request and authenticate tiles. */
export interface AtlasSession {
  readonly assuranceMode: string;
  readonly baseRevision: number;
  readonly createdAt: string;
  readonly deltaRevision: number;
  readonly generation: string;
  readonly manifestHash: string;
  readonly releaseReportHash: string;
  readonly rowCount: number;
  readonly storeSnapshotIdentity: string;
  readonly variant: number;
}

type JsonRecord = Record<string, unknown>;

const isJsonRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const expectRecord = (
  value: unknown,
  context: string,
  kind: AtlasClientErrorKind,
): JsonRecord => {
  if (!isJsonRecord(value)) {
    throw new AtlasClientError(kind, `${context} must be a JSON object`, {
      retryable: false,
    });
  }
  return value;
};

const expectString = (
  record: JsonRecord,
  key: string,
  context: string,
  kind: AtlasClientErrorKind,
): string => {
  const value = record[key];
  if (typeof value !== "string") {
    throw new AtlasClientError(kind, `${context}.${key} must be a string`, {
      retryable: false,
    });
  }
  return value;
};

const expectInteger = (
  record: JsonRecord,
  key: string,
  context: string,
  kind: AtlasClientErrorKind,
): number => {
  const value = record[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new AtlasClientError(
      kind,
      `${context}.${key} must be a non-negative safe integer`,
      { retryable: false },
    );
  }
  return value;
};

const expectHash = (
  record: JsonRecord,
  key: string,
  context: string,
  kind: AtlasClientErrorKind,
): string => {
  const value = expectString(record, key, context, kind);
  if (!sha256Pattern.test(value)) {
    throw new AtlasClientError(
      kind,
      `${context}.${key} must be a lowercase SHA-256 identity`,
      { retryable: false },
    );
  }
  return value;
};

const responseDetail = async (response: Response): Promise<string> => {
  const detail = (await response.text()).trim();
  return detail.length === 0 ? response.statusText : detail.slice(0, 500);
};

const fetchResponse = async (
  path: string,
  signal: AbortSignal,
  accept: string,
): Promise<Response> => {
  try {
    return await fetch(path, {
      cache: "default",
      headers: { Accept: accept },
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    throw new AtlasClientError(
      "network",
      `Could not reach the Atlas API at ${path}`,
      { cause: error },
    );
  }
};

const fetchJson = async (
  path: string,
  signal: AbortSignal,
  noActiveGeneration: boolean,
): Promise<{ readonly payload: unknown; readonly response: Response }> => {
  const response = await fetchResponse(path, signal, "application/json");
  if (!response.ok) {
    const detail = await responseDetail(response);
    const kind =
      noActiveGeneration && response.status === 404
        ? "no-active-generation"
        : "http";
    throw new AtlasClientError(
      kind,
      `${response.status} from ${path}: ${detail}`,
      { status: response.status },
    );
  }

  try {
    const payload: unknown = await response.json();
    return { payload, response };
  } catch (error) {
    throw new AtlasClientError(
      "invalid-json",
      `${path} did not return valid JSON`,
      { cause: error },
    );
  }
};

const unquoteEtag = (etag: string | null): string | undefined => {
  if (etag === null) {
    return undefined;
  }
  const withoutWeakPrefix = etag.startsWith("W/") ? etag.slice(2) : etag;
  if (
    withoutWeakPrefix.length >= 2 &&
    withoutWeakPrefix.startsWith('"') &&
    withoutWeakPrefix.endsWith('"')
  ) {
    return withoutWeakPrefix.slice(1, -1);
  }
  return withoutWeakPrefix;
};

/**
 * Loads and cross-checks the active generation and its published manifest.
 *
 * @throws {@link AtlasClientError} for unavailable, inconsistent, or
 *   unsupported serving state.
 */
export const loadAtlasSession = async (
  signal: AbortSignal,
): Promise<AtlasSession> => {
  const currentResult = await fetchJson("/v1/atlas/current", signal, true);
  const current = expectRecord(
    currentResult.payload,
    "current Atlas response",
    "invalid-json",
  );
  const generation = expectHash(
    current,
    "generation",
    "current Atlas response",
    "invalid-json",
  );
  const manifestHash = expectHash(
    current,
    "manifest_hash",
    "current Atlas response",
    "invalid-json",
  );
  const releaseReportHash = expectHash(
    current,
    "release_report_hash",
    "current Atlas response",
    "invalid-json",
  );

  const manifestResult = await fetchJson(
    "/v1/atlas/current/manifest",
    signal,
    false,
  );
  const manifest = expectRecord(
    manifestResult.payload,
    "Atlas manifest",
    "invalid-manifest",
  );
  const manifestGeneration = expectHash(
    manifest,
    "generation_id",
    "Atlas manifest",
    "invalid-manifest",
  );
  if (manifestGeneration !== generation) {
    throw new AtlasClientError(
      "stale-generation",
      "The active generation changed while the demo was bootstrapping",
    );
  }

  const manifestEtag = unquoteEtag(manifestResult.response.headers.get("etag"));
  if (manifestEtag !== undefined && manifestEtag !== manifestHash) {
    throw new AtlasClientError(
      "stale-generation",
      "The manifest ETag does not match the active generation",
    );
  }

  const inputSnapshot = expectRecord(
    manifest.input_snapshot,
    "Atlas manifest.input_snapshot",
    "invalid-manifest",
  );
  const variants = expectRecord(
    manifest.variants,
    "Atlas manifest.variants",
    "invalid-manifest",
  );
  const storage = expectRecord(
    manifest.storage,
    "Atlas manifest.storage",
    "invalid-manifest",
  );
  const variant = expectInteger(
    variants,
    "canonical_variant",
    "Atlas manifest.variants",
    "invalid-manifest",
  );
  if (variant > 65_535) {
    throw new AtlasClientError(
      "invalid-manifest",
      `Canonical variant ${variant} does not fit the tile wire`,
      { retryable: false },
    );
  }

  const entries = variants.entries;
  if (
    !Array.isArray(entries) ||
    !entries.some(
      (entry) =>
        isJsonRecord(entry) &&
        typeof entry.id === "number" &&
        entry.id === variant,
    )
  ) {
    throw new AtlasClientError(
      "invalid-manifest",
      `Canonical variant ${variant} is not published in the manifest`,
      { retryable: false },
    );
  }

  const rowIdEncoding = expectString(
    storage,
    "row_id_encoding",
    "Atlas manifest.storage",
    "invalid-manifest",
  );
  if (rowIdEncoding !== "u32") {
    throw new AtlasClientError(
      "invalid-manifest",
      `Tile wire v2 cannot decode row ID encoding ${rowIdEncoding}`,
      { retryable: false },
    );
  }

  return {
    assuranceMode: expectString(
      current,
      "assurance_mode",
      "current Atlas response",
      "invalid-json",
    ),
    baseRevision: expectInteger(
      current,
      "base_revision",
      "current Atlas response",
      "invalid-json",
    ),
    createdAt: expectString(
      current,
      "created_at",
      "current Atlas response",
      "invalid-json",
    ),
    deltaRevision: expectInteger(
      current,
      "delta_revision",
      "current Atlas response",
      "invalid-json",
    ),
    generation,
    manifestHash,
    releaseReportHash,
    rowCount: expectInteger(
      storage,
      "row_count",
      "Atlas manifest.storage",
      "invalid-manifest",
    ),
    storeSnapshotIdentity: expectHash(
      inputSnapshot,
      "store_snapshot_identity",
      "Atlas manifest.input_snapshot",
      "invalid-manifest",
    ),
    variant,
  };
};

/**
 * Fetches and decodes one immutable tile for a validated session.
 *
 * @throws {@link AtlasClientError} when HTTP headers or body bytes violate the
 *   selected generation's contract.
 */
export const fetchAtlasTile = async (
  session: AtlasSession,
  coordinate: AtlasTileCoordinate,
  signal: AbortSignal,
): Promise<DecodedAtlasTile> => {
  validateAtlasTileCoordinate(coordinate);
  const path = `/v1/atlas/tile/${session.generation}/${session.variant}/${coordinate.z}/${coordinate.x}/${coordinate.y}`;
  const response = await fetchResponse(path, signal, ATLAS_TILE_MEDIA_TYPE);
  if (!response.ok) {
    const detail = await responseDetail(response);
    const kind = response.status === 404 ? "stale-generation" : "http";
    throw new AtlasClientError(
      kind,
      `${response.status} for tile ${atlasTileKey(coordinate)}: ${detail}`,
      { status: response.status },
    );
  }

  const mediaType = response.headers.get("content-type")?.split(";", 1)[0];
  if (mediaType !== ATLAS_TILE_MEDIA_TYPE) {
    throw new AtlasClientError(
      "invalid-tile",
      `Tile ${atlasTileKey(coordinate)} returned ${mediaType ?? "no content type"}`,
      { retryable: false },
    );
  }

  const buffer = await response.arrayBuffer();
  let tile: DecodedAtlasTile;
  try {
    tile = decodeAtlasTile(buffer, {
      coordinate,
      generation: session.generation,
      manifestHash: session.manifestHash,
      releaseReportHash: session.releaseReportHash,
      storeSnapshotIdentity: session.storeSnapshotIdentity,
      variant: session.variant,
    });
  } catch (error) {
    if (error instanceof AtlasTileWireError) {
      throw new AtlasClientError(
        "invalid-tile",
        `Tile ${atlasTileKey(coordinate)} is invalid: ${error.message}`,
        { cause: error, retryable: false },
      );
    }
    throw error;
  }

  const visibleHeader = response.headers.get("x-atlas-visible-subtree-count");
  const deliveredHeader = response.headers.get("x-atlas-delivered-count");
  if (
    visibleHeader !== null &&
    visibleHeader !== String(tile.visibleSubtreeCount)
  ) {
    throw new AtlasClientError(
      "invalid-tile",
      `Tile ${atlasTileKey(coordinate)} visible-count header disagrees with its body`,
      { retryable: false },
    );
  }
  if (
    deliveredHeader !== null &&
    deliveredHeader !== String(tile.deliveredCount)
  ) {
    throw new AtlasClientError(
      "invalid-tile",
      `Tile ${atlasTileKey(coordinate)} delivered-count header disagrees with its body`,
      { retryable: false },
    );
  }
  return tile;
};

/** Returns whether an unknown failure is an intentional request cancellation. */
export const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "AbortError";
