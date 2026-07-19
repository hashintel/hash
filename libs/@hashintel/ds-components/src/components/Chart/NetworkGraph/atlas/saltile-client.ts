/**
 * Typed client for the atlas Surface v1 API (normative contract:
 * `SPEC-ADDENDUM-API.md` "Surface v1"). Bootstrap is
 * `current()` -> `manifest()` -> POST tile/edges; responses decode
 * through the SALTILE decoders and identical queries are served from
 * an app-layer cache (POST responses are immutable per generation at
 * one permission epoch - the ruled replacement for HTTP caching).
 *
 * The `filter` value is upstream-owned (the frontend `Filter` type
 * cannot be imported here - dependency direction); the client treats
 * it as an opaque JSON-shaped value and the cache keys on its stable
 * serialization.
 */

import { decodeSaltileEdges, type DecodedSaltileEdges } from "./saltile-edges";
import { GENERATION_BYTES } from "./saltile-schema";
import { decodeSaltileTile, type DecodedSaltileTile } from "./saltile-tile";
import { SALTILE_MEDIA_TYPE, SaltileMode } from "./saltile-wire";

/** Response of `GET /v1/atlas/current` - the one mutable read. */
export interface AtlasCurrent {
  /** Active generation identity, 64 hex characters. */
  readonly generation: string;
}

/** Request caps served as data (never synchronized constants). */
export interface AtlasLimits {
  readonly coloredTypeIds: number;
  readonly edgesTiles: number;
  readonly locateNeighbours: number;
}

/** Immutable per-generation manifest. */
export interface AtlasManifest {
  readonly generation: string;
  readonly wireVersion: number;
  readonly variants: readonly string[];
  readonly bucketSchedule: {
    readonly span: number;
    readonly cut: string;
    readonly maxZoom: number;
  };
  readonly limits: AtlasLimits;
  readonly createdAt: string;
}

export interface TileCoordinate {
  readonly z: number;
  readonly x: number;
  readonly y: number;
}

/** Tile POST body; every field optional per Surface v1. */
export interface TileQuery {
  readonly mode?: "delta" | "total";
  readonly coloredTypeIds?: readonly string[];
  readonly filter?: unknown;
  readonly includeDetailedData?: boolean;
}

/** Edges POST body. */
export interface EdgesQuery {
  readonly tiles: readonly TileCoordinate[];
  readonly filter?: unknown;
  readonly includeDetailedData?: boolean;
}

/** An RFC 9457 problem response, or a transport-shaped failure. */
export class AtlasProblemError extends Error {
  override readonly name = "AtlasProblemError";
  readonly status: number;
  readonly type: string;

  constructor(status: number, type: string, detail: string) {
    super(detail);
    this.status = status;
    this.type = type;
  }
}

/** A JSON response violated the Surface v1 schema. */
export class AtlasContractError extends Error {
  override readonly name = "AtlasContractError";
}

const contractFail = (detail: string): never => {
  throw new AtlasContractError(detail);
};

const hexPattern = /^[0-9a-f]{64}$/u;

/** Decodes a 64-hex generation identity into its 32 raw bytes. */
export const generationBytes = (hex: string): Uint8Array => {
  if (!hexPattern.test(hex)) {
    contractFail(`generation is not 64 lowercase hex characters: ${hex}`);
  }
  const bytes = new Uint8Array(GENERATION_BYTES);
  for (let index = 0; index < GENERATION_BYTES; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
};

/**
 * Deterministic serialization for cache keys: object keys sorted at
 * every level. The client keys on the request object IT built - it
 * never reproduces the server's CBOR canonicalization (ruled).
 */
export const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : 1))
      .map(
        ([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`,
      );
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
};

/** Byte-count-free LRU over decoded responses, one per generation. */
class RequestCache {
  readonly #entries = new Map<string, unknown>();
  readonly #maximumEntries: number;

  constructor(maximumEntries: number) {
    this.#maximumEntries = maximumEntries;
  }

  get(key: string): unknown {
    const value = this.#entries.get(key);
    if (value !== undefined) {
      this.#entries.delete(key);
      this.#entries.set(key, value);
    }
    return value;
  }

  set(key: string, value: unknown): void {
    this.#entries.set(key, value);
    if (this.#entries.size > this.#maximumEntries) {
      const oldest = this.#entries.keys().next().value!;
      this.#entries.delete(oldest);
    }
  }
}

const isUintValue = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

/** Index-signature access with a variable key (host idiom: satisfies
 * `dot-notation` and `noPropertyAccessFromIndexSignature` together). */
const field = (record: Record<string, unknown>, key: string): unknown =>
  record[key];

const parseManifest = (value: unknown, generation: string): AtlasManifest => {
  if (typeof value !== "object" || value === null) {
    return contractFail("manifest is not an object");
  }
  const manifest = value as Record<string, unknown>;
  if (field(manifest, "generation") !== generation) {
    return contractFail("manifest generation does not echo the route");
  }
  const wireVersion = field(manifest, "wireVersion");
  if (!isUintValue(wireVersion)) {
    return contractFail("manifest wireVersion must be an unsigned integer");
  }
  const variants = field(manifest, "variants");
  if (
    !Array.isArray(variants) ||
    variants.length === 0 ||
    !variants.every((entry) => typeof entry === "string")
  ) {
    return contractFail("manifest variants must be a non-empty string array");
  }
  const schedule = field(manifest, "bucketSchedule") as Record<
    string,
    unknown
  > | null;
  if (typeof schedule !== "object" || schedule === null) {
    return contractFail("manifest bucketSchedule is not an object");
  }
  const span = field(schedule, "span");
  const cut = field(schedule, "cut");
  const maxZoom = field(schedule, "maxZoom");
  if (!isUintValue(span) || !Number.isInteger(Math.log2(span))) {
    return contractFail(
      `bucketSchedule span must be a power of two (the per-tile grid width); got ${String(span)}`,
    );
  }
  if (typeof cut !== "string" || !isUintValue(maxZoom)) {
    return contractFail("bucketSchedule cut/maxZoom are malformed");
  }
  const limits = field(manifest, "limits") as Record<string, unknown> | null;
  if (typeof limits !== "object" || limits === null) {
    return contractFail("manifest limits are malformed");
  }
  const coloredTypeIds = field(limits, "coloredTypeIds");
  const edgesTiles = field(limits, "edgesTiles");
  const locateNeighbours = field(limits, "locateNeighbours");
  if (
    !isUintValue(coloredTypeIds) ||
    !isUintValue(edgesTiles) ||
    !isUintValue(locateNeighbours)
  ) {
    return contractFail("manifest limits are malformed");
  }
  const createdAt = field(manifest, "createdAt");
  if (typeof createdAt !== "string") {
    return contractFail("manifest createdAt must be an ISO-8601 string");
  }
  return {
    generation,
    wireVersion,
    variants,
    bucketSchedule: { span, cut, maxZoom },
    limits: { coloredTypeIds, edgesTiles, locateNeighbours },
    createdAt,
  };
};

const raiseProblem = async (response: Response): Promise<never> => {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.startsWith("application/problem+json")) {
    const problem = (await response.json()) as Record<string, unknown>;
    const type = field(problem, "type");
    const detail = field(problem, "detail");
    throw new AtlasProblemError(
      response.status,
      typeof type === "string" ? type : "about:blank",
      typeof detail === "string" ? detail : `HTTP ${response.status}`,
    );
  }
  throw new AtlasProblemError(
    response.status,
    "about:blank",
    `HTTP ${response.status} without a problem document`,
  );
};

/** Injectable transport, matching the WHATWG fetch signature. */
export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
    priority?: RequestPriority;
  },
) => Promise<Response>;

/**
 * Per-request transport controls, forwarded to the fetch
 * implementation verbatim. Never part of the response cache identity:
 * an aborted request rejects before caching, so a cancelled prefetch
 * costs a refetch, never a poisoned entry.
 */
export interface RequestControls {
  /** Aborts the request (speculative prefetches are cancellable). */
  readonly signal?: AbortSignal;
  /** Network priority hint; prefetches pass "low". */
  readonly priority?: RequestPriority;
}

export interface AtlasSession {
  readonly generation: string;
  readonly generationBytes: Uint8Array;
  readonly manifest: AtlasManifest;
  readonly variant: string;
  readonly spanLog2: number;
}

/**
 * Surface v1 client. One instance per origin; `bootstrap()` pins a
 * session to the active generation, POST responses cache per
 * (route, stable query) within it. Generation rotation (a 404 on a
 * pinned route, or a fresh `current()` disagreeing) is the caller's
 * signal to bootstrap again; the old session's cache is dropped with
 * the session object.
 */
export class AtlasClient {
  readonly #base: string;
  readonly #fetch: FetchLike;
  readonly #cache: RequestCache;

  constructor(baseUrl: string, fetchImpl: FetchLike, cacheEntries = 512) {
    this.#base = baseUrl.replace(/\/$/u, "");
    this.#fetch = fetchImpl;
    this.#cache = new RequestCache(cacheEntries);
  }

  async current(): Promise<AtlasCurrent> {
    const response = await this.#fetch(`${this.#base}/v1/atlas/current`);
    if (!response.ok) {
      return raiseProblem(response);
    }
    const body = (await response.json()) as Record<string, unknown>;
    const generation = field(body, "generation");
    if (typeof generation !== "string") {
      return contractFail("current.generation must be a string");
    }
    generationBytes(generation);
    return { generation };
  }

  async manifest(generation: string): Promise<AtlasManifest> {
    const response = await this.#fetch(
      `${this.#base}/v1/atlas/generation/${generation}/manifest`,
    );
    if (!response.ok) {
      return raiseProblem(response);
    }
    return parseManifest(await response.json(), generation);
  }

  /** `current()` -> `manifest()` -> a pinned session. */
  async bootstrap(variant?: string): Promise<AtlasSession> {
    const { generation } = await this.current();
    const manifest = await this.manifest(generation);
    const chosen = variant ?? manifest.variants[0]!;
    if (!manifest.variants.includes(chosen)) {
      contractFail(
        `variant ${chosen} is not in the manifest set [${manifest.variants.join(", ")}]`,
      );
    }
    return {
      generation,
      generationBytes: generationBytes(generation),
      manifest,
      variant: chosen,
      spanLog2: Math.log2(manifest.bucketSchedule.span),
    };
  }

  async tile(
    session: AtlasSession,
    coordinate: TileCoordinate,
    query: TileQuery = {},
    controls: RequestControls = {},
  ): Promise<DecodedSaltileTile> {
    const typeIds = query.coloredTypeIds ?? [];
    if (typeIds.length > session.manifest.limits.coloredTypeIds) {
      contractFail(
        `coloredTypeIds carries ${typeIds.length} ids; the manifest caps ${session.manifest.limits.coloredTypeIds}`,
      );
    }
    const route = `/v1/atlas/tile/${session.generation}/${session.variant}/${coordinate.z}/${coordinate.x}/${coordinate.y}`;
    const buffer = await this.#post(route, query, controls);
    return decodeSaltileTile(buffer, {
      generation: session.generationBytes,
      variant: session.manifest.variants.indexOf(session.variant),
      coordinate,
      mode: query.mode === "total" ? SaltileMode.Total : SaltileMode.Delta,
      spanLog2: session.spanLog2,
      coloredTypeIdCount: typeIds.length,
      includeDetailedData: query.includeDetailedData ?? false,
    });
  }

  async edges(
    session: AtlasSession,
    query: EdgesQuery,
    controls: RequestControls = {},
  ): Promise<DecodedSaltileEdges> {
    if (query.tiles.length > session.manifest.limits.edgesTiles) {
      contractFail(
        `tiles lists ${query.tiles.length} coordinates; the manifest caps ${session.manifest.limits.edgesTiles}`,
      );
    }
    const route = `/v1/atlas/edges/${session.generation}/${session.variant}`;
    const buffer = await this.#post(route, query, controls);
    return decodeSaltileEdges(buffer, {
      generation: session.generationBytes,
      variant: session.manifest.variants.indexOf(session.variant),
      includeDetailedData: query.includeDetailedData ?? false,
    });
  }

  async #post(
    route: string,
    query: unknown,
    controls: RequestControls,
  ): Promise<ArrayBuffer> {
    const key = `${route} ${stableStringify(query)}`;
    const cached = this.#cache.get(key);
    if (cached !== undefined) {
      return cached as ArrayBuffer;
    }

    const response = await this.#fetch(`${this.#base}${route}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(query),
      ...(controls.signal === undefined ? {} : { signal: controls.signal }),
      ...(controls.priority === undefined
        ? {}
        : { priority: controls.priority }),
    });
    if (!response.ok) {
      return raiseProblem(response);
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith(SALTILE_MEDIA_TYPE)) {
      return contractFail(
        `response carries ${contentType}; expected ${SALTILE_MEDIA_TYPE}`,
      );
    }
    const buffer = await response.arrayBuffer();
    this.#cache.set(key, buffer);
    return buffer;
  }
}
