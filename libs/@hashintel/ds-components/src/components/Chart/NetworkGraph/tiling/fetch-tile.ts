/**
 * Fetches one Atlas quadtree tile over the SALTILE wire (Surface v1) and
 * decodes it into renderable node records.
 *
 * The flow mirrors the serving contract:
 *
 *  1. Bootstrap a session: read `GET /v1/atlas/current` for the active
 *     generation, then its immutable manifest (canonical variant, bucket
 *     schedule, max zoom). The session binds every tile to one generation and
 *     is memoized per origin (see {@link clearAtlasSessionCache}) so a
 *     viewport's worth of tile fetches shares a single bootstrap.
 *  2. Turn `(zoom, tileIndex)` into the Morton quadrant `(z, x, y)` and POST
 *     the tile request for that quadrant of the canonical variant, in delta
 *     mode with no colored types or detailed data.
 *  3. Decode and identity-check the payload with {@link decodeSaltileTile},
 *     then pair each `rowId` with its position.
 *
 * SALTILE positions arrive in the wire frame, `[-1, 1]` per axis; this layer's
 * world is `[0, WORLD_SIZE)` with the same power-of-two tile grid, so tile
 * cells align exactly and only positions need mapping:
 * `world = (wire + 1) * WORLD_SIZE / 2`. Both factors are powers of two, so
 * the map is an exact, reversible display transform.
 *
 * HTTP requests are retried with exponential backoff on transient failures —
 * transport errors and `5xx`/`429` responses (see {@link withAtlasRetry}).
 * Terminal failures (`4xx`, a decode mismatch) are not retried; a `404`,
 * meaning the cached generation rotated, has its own one-shot session refresh
 * in {@link fetchTile}.
 */

import {
  generationBytes,
  parseCurrent,
  parseManifest,
} from "../atlas-decode/manifest";
import {
  decodeSaltileTile,
  type SaltileTileRequest,
} from "../atlas-decode/tile";
import { SALTILE_MEDIA_TYPE, SaltileMode } from "../atlas-decode/wire";
import {
  ATLAS_TILE_MAX_ZOOM,
  atlasTileKey,
  type AtlasTileCoordinate,
} from "./atlas-tile-coordinate";
import { WORLD_SIZE } from "./tile-geometry";

/** Default binding of the local `hash-graph atlas` dev server. */
export const ATLAS_API_BASE_URL = "http://127.0.0.1:4003";

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

/** A decoded tile: its delivered nodes plus the level-of-detail descent signal. */
export interface FetchedTile {
  /** Delivered point representatives; may be a spatially fair prefix of the subtree. */
  readonly nodes: TileNode[];
  /**
   * Whether every point in this tile's subtree was delivered here. When `false`,
   * the undelivered points live in deeper tiles, so a viewport wanting full
   * detail descends into this tile's children rather than stopping at it.
   */
  readonly complete: boolean;
}

/** Optional per-call overrides for {@link fetchTile}. */
export interface FetchTileOptions {
  /** Atlas API origin. Defaults to {@link ATLAS_API_BASE_URL}. */
  readonly baseUrl?: string;
  /** Cancels the tile request. */
  readonly signal?: AbortSignal;
  /** Retries on a transient failure. Defaults to {@link DEFAULT_RETRIES}. */
  readonly retry?: number;
  /**
   * Network priority hint for the tile request. Speculative prefetches pass
   * `"low"` so required loads win the connection's bandwidth (an HTTP/2 stream
   * priority; a lower scheduling priority on HTTP/1.1).
   */
  readonly priority?: RequestPriority;
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
 * Best-effort human-readable detail from a failed response, preferring an
 * RFC 9457 `problem+json` document's `detail`, then the `{ "error": ... }`
 * envelope, tolerating a plain-text body.
 */
const readErrorDetail = async (response: Response): Promise<string> => {
  const text = await response.text().catch(() => "");
  try {
    const body: unknown = JSON.parse(text);
    if (typeof body === "object" && body !== null) {
      if ("detail" in body && typeof body.detail === "string") {
        return body.detail;
      }
      if ("error" in body && typeof body.error === "string") {
        return body.error;
      }
    }
  } catch {
    // Not a JSON body; fall back to the raw text below.
  }
  return text || response.statusText || "no error detail";
};

/** A single request that resolves only on a 2xx response and otherwise throws. */
const requestAtlasOnce = async (
  url: string,
  accept: string,
  signal: AbortSignal | undefined,
  priority: RequestPriority | undefined,
  body: string | undefined,
): Promise<Response> => {
  let response: Response;
  try {
    response =
      body === undefined
        ? await fetch(url, { headers: { accept }, signal, priority })
        : await fetch(url, {
            method: "POST",
            headers: { accept, "content-type": "application/json" },
            body,
            signal,
            priority,
          });
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

/**
 * Requests `url`, retrying transient failures, resolving only on a 2xx
 * response. A `body` sends it as a JSON `POST`; otherwise it is a `GET`.
 */
const requestAtlas = (
  url: string,
  accept: string,
  signal: AbortSignal | undefined,
  retries?: number,
  priority?: RequestPriority,
  body?: string,
): Promise<Response> =>
  withAtlasRetry(() => requestAtlasOnce(url, accept, signal, priority, body), {
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

/** Immutable identities and schedule that bind every tile of one generation. */
interface SaltileSession {
  /** Active generation, 64 hex characters; addresses the tile route. */
  readonly generation: string;
  /** The same generation as 32 raw bytes; checked against the HEAD echo. */
  readonly generationBytes: Uint8Array;
  /** Canonical variant name; addresses the tile route. */
  readonly variant: string;
  /** Canonical variant's index in the manifest set; checked against the HEAD echo. */
  readonly variantIndex: number;
  /** `log2` of the bucket-schedule span (the manifest's `m`). */
  readonly spanLog2: number;
  /** Deepest requestable zoom the manifest allows. */
  readonly maxZoom: number;
}

const fetchSaltileSession = async (
  baseUrl: string,
): Promise<SaltileSession> => {
  // `current` names the active generation; its manifest carries the canonical
  // variant set, bucket schedule, and max zoom. The reads are deliberately not
  // tied to any caller's AbortSignal: the result is shared across every tile
  // fetch, so one caller aborting must not poison the memoized value.
  const current = parseCurrent(
    await fetchAtlasJson(`${baseUrl}/v1/atlas/current`, undefined),
  );
  const manifest = parseManifest(
    await fetchAtlasJson(
      `${baseUrl}/v1/atlas/generation/${current.generation}/manifest`,
      undefined,
    ),
    current.generation,
  );

  // The manifest's first variant is canonical; `parseManifest` guarantees the
  // set is non-empty, so it is index 0.
  const [variant] = manifest.variants;
  if (variant === undefined) {
    throw new FetchTileError("manifest carries no variants");
  }

  return {
    generation: current.generation,
    generationBytes: generationBytes(current.generation),
    variant,
    variantIndex: 0,
    spanLog2: Math.log2(manifest.bucketSchedule.span),
    maxZoom: manifest.bucketSchedule.maxZoom,
  };
};

/**
 * Memoized session promise per origin. The active generation rarely changes,
 * so this is held for the lifetime of the session and only dropped on an
 * explicit {@link clearAtlasSessionCache} or a `404` that signals the cached
 * generation is no longer active (see {@link fetchTile}). Caching the promise
 * (not the resolved value) also collapses the concurrent first-callers of a
 * fresh viewport into a single bootstrap.
 */
const sessionCache = new Map<string, Promise<SaltileSession>>();

const getSaltileSession = (baseUrl: string): Promise<SaltileSession> => {
  const cached = sessionCache.get(baseUrl);
  if (cached) {
    return cached;
  }
  const pending = fetchSaltileSession(baseUrl).catch((error: unknown) => {
    // Never cache a rejection: the next caller should get a fresh attempt.
    if (sessionCache.get(baseUrl) === pending) {
      sessionCache.delete(baseUrl);
    }
    throw error;
  });
  sessionCache.set(baseUrl, pending);
  return pending;
};

/**
 * Drops the memoized active-generation session, forcing the next
 * {@link fetchTile} call to re-bootstrap. Pass a `baseUrl` to clear one origin,
 * or omit it to clear all.
 */
export const clearAtlasSessionCache = (baseUrl?: string): void => {
  if (baseUrl === undefined) {
    sessionCache.clear();
  } else {
    sessionCache.delete(baseUrl);
  }
};

const fetchAndDecodeTile = async (
  session: SaltileSession,
  coordinate: AtlasTileCoordinate,
  baseUrl: string,
  signal: AbortSignal | undefined,
  retries: number | undefined,
  priority: RequestPriority | undefined,
): Promise<FetchedTile> => {
  const { z, x, y } = coordinate;
  if (z > session.maxZoom) {
    throw new FetchTileError(
      `zoom ${z} is beyond the manifest maxZoom ${session.maxZoom}`,
    );
  }

  const tileUrl = `${baseUrl}/v1/atlas/tile/${session.generation}/${session.variant}/${z}/${x}/${y}`;
  // An empty query: delta mode, no colored types, no detailed data.
  const tileResponse = await requestAtlas(
    tileUrl,
    SALTILE_MEDIA_TYPE,
    signal,
    retries,
    priority,
    "{}",
  );

  const contentType = tileResponse.headers.get("content-type") ?? "";
  if (!contentType.startsWith(SALTILE_MEDIA_TYPE)) {
    throw new FetchTileError(
      `tile ${atlasTileKey(coordinate)} arrived as ${contentType}; expected ${SALTILE_MEDIA_TYPE}`,
    );
  }
  const buffer = await tileResponse.arrayBuffer();

  const request: SaltileTileRequest = {
    generation: session.generationBytes,
    variant: session.variantIndex,
    coordinate,
    mode: SaltileMode.Delta,
    spanLog2: session.spanLog2,
    coloredTypeIdCount: 0,
    includeDetailedData: false,
  };

  let tile;
  try {
    tile = decodeSaltileTile(buffer, request);
  } catch (cause) {
    throw new FetchTileError(
      `failed to decode tile ${atlasTileKey(coordinate)}`,
      { cause },
    );
  }

  // Wire frame [-1, 1] onto the layer's world [0, WORLD_SIZE): an exact
  // power-of-two scale; the tile grids already align.
  const scale = WORLD_SIZE / 2;
  const { delivered, positions, rowIds } = tile;
  const nodes: TileNode[] = new Array<TileNode>(delivered);
  for (let index = 0; index < delivered; index += 1) {
    const id = rowIds[index];
    const wireX = positions[index * 2];
    const wireY = positions[index * 2 + 1];
    // Unreachable: `decodeSaltileTile` guarantees these array lengths. The guard
    // satisfies the strict typed-array index type without a non-null assertion.
    if (id === undefined || wireX === undefined || wireY === undefined) {
      throw new FetchTileError(
        `tile ${atlasTileKey(coordinate)} record ${index} is truncated`,
      );
    }
    nodes[index] = { id, x: (wireX + 1) * scale, y: (wireY + 1) * scale };
  }

  // `children` is the occupancy bitmask of the four Morton children below this
  // cut; 0 means nothing deeper exists, i.e. the subtree is fully delivered.
  return { nodes, complete: tile.children === 0 };
};

/**
 * Fetches the tile at `tileIndex` for the given `zoom` and returns its nodes.
 *
 * `zoom` is the quadtree depth; each level splits every tile into four, so
 * depth `zoom` has a `2 ** zoom` by `2 ** zoom` grid. `tileIndex` addresses that
 * grid flattened row-major into a single line, so it must be an integer in
 * `[0, 4 ** zoom)`.
 *
 * @returns The tile's delivered points (each a durable id and global world
 *   coordinates) plus its `complete` flag. The points may be a truncated,
 *   spatially fair prefix when the server's budget caps delivery; `complete` is
 *   then `false`, signalling that deeper tiles hold the rest.
 * @throws {@link FetchTileError} when the arguments are out of range, a request
 *   fails or is rejected, or the tile payload fails to decode or does not
 *   belong to the requested route and active generation.
 */
export const fetchTile = async (
  zoom: number,
  tileIndex: number,
  options: FetchTileOptions = {},
): Promise<FetchedTile> => {
  const { baseUrl = ATLAS_API_BASE_URL, signal, retry, priority } = options;

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

  const session = await getSaltileSession(baseUrl);
  try {
    return await fetchAndDecodeTile(
      session,
      coordinate,
      baseUrl,
      signal,
      retry,
      priority,
    );
  } catch (error) {
    // A 404 on a well-formed request means the generation we pinned is no
    // longer active. Re-bootstrap the session once and retry before giving up.
    if (error instanceof FetchTileError && error.status === 404) {
      clearAtlasSessionCache(baseUrl);
      const refreshed = await getSaltileSession(baseUrl);
      return await fetchAndDecodeTile(
        refreshed,
        coordinate,
        baseUrl,
        signal,
        retry,
        priority,
      );
    }
    throw error;
  }
};
