/**
 * Fetches one Atlas quadtree tile and decodes it into renderable node records.
 *
 * The flow mirrors the serving contract:
 *
 *  1. Read the active generation's manifest (`generation`, canonical variant,
 *     store-snapshot identity) and `current` metadata (`manifest_hash`,
 *     `release_report_hash`). Together these bind a tile to one immutable
 *     generation. This metadata is memoized per origin (see
 *     {@link clearAtlasMetadataCache}) so a viewport's worth of tile fetches
 *     shares a single metadata round-trip.
 *  2. Turn `(zoom, tileIndex)` into the Morton quadrant `(z, x, y)` and fetch
 *     the binary tile for that quadrant of the canonical variant.
 *  3. Decode and identity-check the payload with {@link decodeAtlasTile}, then
 *     pair each `rowId` with its interleaved `x, y` position.
 *
 * Positions arrive as global 16-bit world coordinates (`[0, 65536)` per axis),
 * not relative to the zoom level, so they are returned unchanged.
 *
 * HTTP requests are retried with exponential backoff on transient failures —
 * transport errors and `5xx`/`429` responses (see {@link withAtlasRetry}).
 * Terminal failures (`4xx`, a decode mismatch) are not retried; a `404`, meaning
 * the cached generation rotated, has its own one-shot metadata refresh in
 * {@link fetchTile}.
 */

import {
  ATLAS_TILE_MAX_ZOOM,
  atlasTileKey,
  type AtlasTileCoordinate,
} from "./atlas-tile-coordinate";
import {
  ATLAS_TILE_MEDIA_TYPE,
  decodeAtlasTile,
  type AtlasTileExpectation,
} from "./decode-atlas-tile";

/** Default binding of the local `hash-graph atlas` dev server. */
export const ATLAS_API_BASE_URL = "http://127.0.0.1:4010";

/** Retries (after the first attempt) for a transient HTTP failure. */
const DEFAULT_RETRIES = 2;
/** First backoff step; doubles each retry up to {@link RETRY_MAX_DELAY_MS}. */
const RETRY_BASE_DELAY_MS = 200;
/** Ceiling on a single backoff wait. */
const RETRY_MAX_DELAY_MS = 2_000;

/** One decoded point: a durable row id and its global world coordinates. */
export interface TileNode {
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

/** Optional per-call overrides for {@link fetchTile}. */
export interface FetchTileOptions {
  /** Atlas API origin. Defaults to {@link ATLAS_API_BASE_URL}. */
  readonly baseUrl?: string;
  /** Cancels the tile request. */
  readonly signal?: AbortSignal;
  /** Retries on a transient failure. Defaults to {@link DEFAULT_RETRIES}. */
  readonly retry?: number;
}

interface FetchTileErrorOptions extends ErrorOptions {
  /** HTTP status when the failure came from a non-2xx response. */
  readonly status?: number;
}

/** A tile could not be fetched, was rejected by the server, or failed to decode. */
export class FetchTileError extends Error {
  override readonly name = "FetchTileError";
  /** Present when the failure originated from a non-2xx HTTP response. */
  readonly status: number | undefined;

  constructor(message: string, options?: FetchTileErrorOptions) {
    super(message, options);
    this.status = options?.status;
  }
}

const asObject = (value: unknown, label: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null) {
    throw new FetchTileError(`${label} is not a JSON object`);
  }
  return value as Record<string, unknown>;
};

// Field readers take the key as a variable so the required bracket access to a
// `Record` index signature stays clear of the `dot-notation` lint rule.
const objectField = (
  record: Record<string, unknown>,
  key: string,
  label: string,
): Record<string, unknown> => asObject(record[key], label);

const stringField = (
  record: Record<string, unknown>,
  key: string,
  label: string,
): string => {
  const value = record[key];
  if (typeof value !== "string") {
    throw new FetchTileError(`${label} is missing or not a string`);
  }
  return value;
};

const numberField = (
  record: Record<string, unknown>,
  key: string,
  label: string,
): number => {
  const value = record[key];
  if (typeof value !== "number") {
    throw new FetchTileError(`${label} is missing or not a number`);
  }
  return value;
};

const abortError = (signal: AbortSignal | undefined): FetchTileError =>
  new FetchTileError("Atlas request aborted", { cause: signal?.reason });

/**
 * A failure worth retrying: a transport error (no HTTP status reached us) or the
 * server asking us to try again (`429`, `5xx`). Terminal failures — `4xx`
 * (including the `404` generation-rotation signal) and non-HTTP errors such as a
 * decode mismatch — are not retried.
 */
const isRetryableError = (error: unknown): boolean => {
  if (!(error instanceof FetchTileError)) {
    return false;
  }
  return (
    error.status === undefined || error.status === 429 || error.status >= 500
  );
};

const backoffDelayMs = (attempt: number, base: number, max: number): number => {
  const window = Math.min(base * 2 ** attempt, max);
  // Full jitter spreads a viewport's simultaneous tile retries over the window,
  // so they do not resynchronise into bursts against the server.
  return window / 2 + Math.random() * (window / 2);
};

/** A `setTimeout` that also settles (rejecting) the moment `signal` aborts. */
const sleep = (ms: number, signal: AbortSignal | undefined): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal));
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onAbort = (): void => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      reject(abortError(signal));
    };
    timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });

/** Retry policy for {@link withAtlasRetry}. */
export interface AtlasRetryPolicy {
  /** Aborts the operation and any pending backoff wait. */
  readonly signal?: AbortSignal;
  /** Retries after the first attempt. Defaults to {@link DEFAULT_RETRIES}. */
  readonly retries?: number;
  /** First backoff step in ms. Defaults to {@link RETRY_BASE_DELAY_MS}. */
  readonly baseDelayMs?: number;
  /** Ceiling on a backoff wait in ms. Defaults to {@link RETRY_MAX_DELAY_MS}. */
  readonly maxDelayMs?: number;
}

/**
 * Runs `operation`, retrying it on a transient failure (see
 * {@link isRetryableError}) with exponential, jittered backoff. Stops early —
 * rethrowing the last error — on a terminal failure, once `retries` is
 * exhausted, or as soon as `signal` aborts.
 */
export const withAtlasRetry = async <T>(
  operation: () => Promise<T>,
  policy: AtlasRetryPolicy = {},
): Promise<T> => {
  const {
    signal,
    retries = DEFAULT_RETRIES,
    baseDelayMs = RETRY_BASE_DELAY_MS,
    maxDelayMs = RETRY_MAX_DELAY_MS,
  } = policy;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= retries || signal?.aborted || !isRetryableError(error)) {
        throw error;
      }
      await sleep(backoffDelayMs(attempt, baseDelayMs, maxDelayMs), signal);
    }
  }
};

/**
 * Best-effort human-readable detail from a failed response, preferring the
 * `{ "error": ... }` envelope but tolerating the framework's plain-text 400s.
 */
const readErrorDetail = async (response: Response): Promise<string> => {
  const text = await response.text().catch(() => "");
  try {
    const body: unknown = JSON.parse(text);
    if (typeof body === "object" && body !== null && "error" in body) {
      const { error } = body as { error: unknown };
      if (typeof error === "string") {
        return error;
      }
    }
  } catch {
    // Not the JSON error envelope; fall back to the raw body below.
  }
  return text || response.statusText || "no error detail";
};

/** A single GET that resolves only on a 2xx response and otherwise throws. */
const requestAtlasOnce = async (
  url: string,
  accept: string,
  signal: AbortSignal | undefined,
): Promise<Response> => {
  let response: Response;
  try {
    response = await fetch(url, { headers: { accept }, signal });
  } catch (cause) {
    throw new FetchTileError(`Atlas request to ${url} failed`, { cause });
  }
  if (!response.ok) {
    throw new FetchTileError(
      `Atlas responded ${response.status} for ${url}: ${await readErrorDetail(response)}`,
      { status: response.status },
    );
  }
  return response;
};

/** GETs `url`, retrying transient failures, resolving only on a 2xx response. */
const requestAtlas = (
  url: string,
  accept: string,
  signal: AbortSignal | undefined,
  retries?: number,
): Promise<Response> =>
  withAtlasRetry(() => requestAtlasOnce(url, accept, signal), {
    signal,
    retries,
  });

const fetchAtlasJson = async (
  url: string,
  signal: AbortSignal | undefined,
): Promise<unknown> => {
  const response = await requestAtlas(url, "application/json", signal);
  try {
    return (await response.json()) as unknown;
  } catch (cause) {
    throw new FetchTileError(`Atlas response from ${url} was not JSON`, {
      cause,
    });
  }
};

/** Immutable identities that bind every tile of one active generation. */
interface AtlasMetadata {
  readonly generation: string;
  readonly manifestHash: string;
  readonly releaseReportHash: string;
  readonly storeSnapshotIdentity: string;
  readonly variant: number;
}

const fetchAtlasMetadata = async (baseUrl: string): Promise<AtlasMetadata> => {
  // The manifest names the active generation, its canonical variant, and the
  // store-snapshot identity; `current` carries the two hashes the manifest body
  // omits. The requests are deliberately not tied to any caller's AbortSignal:
  // the result is shared across every tile fetch, so one caller aborting must
  // not poison the memoized value for the others.
  const [manifest, current] = await Promise.all([
    fetchAtlasJson(`${baseUrl}/v1/atlas/current/manifest`, undefined),
    fetchAtlasJson(`${baseUrl}/v1/atlas/current`, undefined),
  ]);

  const manifestRecord = asObject(manifest, "Atlas manifest");
  const generation = stringField(
    manifestRecord,
    "generation_id",
    "manifest.generation_id",
  );
  const inputSnapshot = objectField(
    manifestRecord,
    "input_snapshot",
    "manifest.input_snapshot",
  );
  const storeSnapshotIdentity = stringField(
    inputSnapshot,
    "store_snapshot_identity",
    "manifest.input_snapshot.store_snapshot_identity",
  );
  const variants = objectField(manifestRecord, "variants", "manifest.variants");
  const variant = numberField(
    variants,
    "canonical_variant",
    "manifest.variants.canonical_variant",
  );

  const currentRecord = asObject(current, "Atlas current-generation metadata");
  const manifestHash = stringField(
    currentRecord,
    "manifest_hash",
    "current.manifest_hash",
  );
  const releaseReportHash = stringField(
    currentRecord,
    "release_report_hash",
    "current.release_report_hash",
  );
  const currentGeneration = stringField(
    currentRecord,
    "generation",
    "current.generation",
  );

  // The tile is bound to a single generation; if the active generation rotated
  // between the two metadata reads the hashes would not match the tile header.
  if (currentGeneration !== generation) {
    throw new FetchTileError(
      `active generation changed while reading metadata: manifest ${generation} vs current ${currentGeneration}`,
    );
  }

  return {
    generation,
    manifestHash,
    releaseReportHash,
    storeSnapshotIdentity,
    variant,
  };
};

/**
 * Memoized metadata promise per origin. The active generation rarely changes,
 * so this is held for the lifetime of the session and only dropped on an
 * explicit {@link clearAtlasMetadataCache} or a `404` that signals the cached
 * generation is no longer active (see {@link fetchTile}). Caching the
 * promise (not the resolved value) also collapses the concurrent first-callers
 * of a fresh viewport into a single round-trip.
 */
const metadataCache = new Map<string, Promise<AtlasMetadata>>();

const getAtlasMetadata = (baseUrl: string): Promise<AtlasMetadata> => {
  const cached = metadataCache.get(baseUrl);
  if (cached) {
    return cached;
  }
  const pending = fetchAtlasMetadata(baseUrl).catch((error: unknown) => {
    // Never cache a rejection: the next caller should get a fresh attempt.
    if (metadataCache.get(baseUrl) === pending) {
      metadataCache.delete(baseUrl);
    }
    throw error;
  });
  metadataCache.set(baseUrl, pending);
  return pending;
};

/**
 * Drops the memoized active-generation metadata, forcing the next
 * {@link fetchTile} call to re-read it. Pass a `baseUrl` to clear one
 * origin, or omit it to clear all.
 */
export const clearAtlasMetadataCache = (baseUrl?: string): void => {
  if (baseUrl === undefined) {
    metadataCache.clear();
  } else {
    metadataCache.delete(baseUrl);
  }
};

const fetchAndDecodeTile = async (
  metadata: AtlasMetadata,
  coordinate: AtlasTileCoordinate,
  baseUrl: string,
  signal: AbortSignal | undefined,
  retries: number | undefined,
): Promise<TileNode[]> => {
  const { z, x, y } = coordinate;
  const expectation: AtlasTileExpectation = {
    coordinate,
    generation: metadata.generation,
    manifestHash: metadata.manifestHash,
    releaseReportHash: metadata.releaseReportHash,
    storeSnapshotIdentity: metadata.storeSnapshotIdentity,
    variant: metadata.variant,
  };

  const tileUrl = `${baseUrl}/v1/atlas/tile/${metadata.generation}/${metadata.variant}/${z}/${x}/${y}`;
  const tileResponse = await requestAtlas(
    tileUrl,
    ATLAS_TILE_MEDIA_TYPE,
    signal,
    retries,
  );
  const buffer = await tileResponse.arrayBuffer();

  let tile;
  try {
    tile = decodeAtlasTile(buffer, expectation);
  } catch (cause) {
    throw new FetchTileError(
      `failed to decode tile ${atlasTileKey(coordinate)}`,
      { cause },
    );
  }

  const { deliveredCount, positions, rowIds } = tile;
  const nodes: TileNode[] = new Array<TileNode>(deliveredCount);
  for (let index = 0; index < deliveredCount; index += 1) {
    const id = rowIds[index];
    const nodeX = positions[index * 2];
    const nodeY = positions[index * 2 + 1];
    // Unreachable: `decodeAtlasTile` guarantees these array lengths. The guard
    // satisfies the strict typed-array index type without a non-null assertion.
    if (id === undefined || nodeX === undefined || nodeY === undefined) {
      throw new FetchTileError(
        `tile ${atlasTileKey(coordinate)} record ${index} is truncated`,
      );
    }
    nodes[index] = { id, x: nodeX, y: nodeY };
  }

  return nodes;
};

/**
 * Fetches the tile at `tileIndex` for the given `zoom` and returns its nodes.
 *
 * `zoom` is the quadtree depth; each level splits every tile into four, so
 * depth `zoom` has a `2 ** zoom` by `2 ** zoom` grid. `tileIndex` addresses that
 * grid flattened row-major into a single line, so it must be an integer in
 * `[0, 4 ** zoom)`.
 *
 * @returns The delivered points, each as a durable id and its global 16-bit
 *   world coordinates. May be empty (or a truncated, spatially fair prefix) when
 *   the server's point budget caps delivery for the quadrant.
 * @throws {@link FetchTileError} when the arguments are out of range, a
 *   request fails or is rejected, or the tile payload fails to decode or does
 *   not belong to the requested route and active generation.
 */
export const fetchTile = async (
  zoom: number,
  tileIndex: number,
  options: FetchTileOptions = {},
): Promise<TileNode[]> => {
  const { baseUrl = ATLAS_API_BASE_URL, signal, retry } = options;

  if (!Number.isInteger(zoom) || zoom < 0 || zoom > ATLAS_TILE_MAX_ZOOM) {
    throw new FetchTileError(
      `zoom ${zoom} must be an integer in 0..=${ATLAS_TILE_MAX_ZOOM}`,
    );
  }

  // Each axis holds `2 ** zoom` tiles, so the flattened grid holds `4 ** zoom`.
  const gridSize = 2 ** zoom;
  const tileCount = gridSize * gridSize;
  if (!Number.isInteger(tileIndex) || tileIndex < 0 || tileIndex >= tileCount) {
    throw new FetchTileError(
      `tileIndex ${tileIndex} must be an integer in 0..${tileCount} at zoom ${zoom}`,
    );
  }

  // Row-major un-flattening: `tileIndex = y * gridSize + x`, top-left origin.
  const coordinate: AtlasTileCoordinate = {
    z: zoom,
    x: tileIndex % gridSize,
    y: Math.floor(tileIndex / gridSize),
  };

  const metadata = await getAtlasMetadata(baseUrl);
  try {
    return await fetchAndDecodeTile(
      metadata,
      coordinate,
      baseUrl,
      signal,
      retry,
    );
  } catch (error) {
    // A 404 on a well-formed request means the generation we cached is no
    // longer active. Refresh the metadata once and retry before giving up.
    if (error instanceof FetchTileError && error.status === 404) {
      clearAtlasMetadataCache(baseUrl);
      const refreshed = await getAtlasMetadata(baseUrl);
      return await fetchAndDecodeTile(
        refreshed,
        coordinate,
        baseUrl,
        signal,
        retry,
      );
    }
    throw error;
  }
};
