/**
 * Fetches one Atlas quadtree tile over the SALTILE wire (Surface v1) and
 * decodes it into renderable node records.
 *
 * The flow mirrors the serving contract:
 *
 *  1. Bootstrap a session: read `GET /atlas/current` for the active
 *     generation, then its immutable manifest (canonical variant, bucket
 *     schedule, max zoom). The session binds every tile to one generation and
 *     is memoized per origin (see {@link clearAtlasSessionCache}) so a
 *     viewport's worth of tile fetches shares a single bootstrap. The manifest
 *     response also mints the authority token the data routes require, which
 *     this layer retains and presents back (see {@link ATLAS_AUTHORITY_HEADER}
 *     and {@link renewAtlasAuthority}).
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
 * Terminal failures (`4xx`, a decode mismatch) are not retried; a `404`, meaning
 * the pinned generation is no longer served — a re-pin — has its own one-shot
 * session refresh in {@link fetchTile}, and a `401`, meaning the authority token
 * no longer admits the request, has its own one-shot token renewal in
 * {@link requestAtlas}.
 */

import { apiOrigin } from "@local/hash-isomorphic-utils/environment";

import { registerPrincipalScopedReset } from "../../../shared/principal-scoped-state";
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

/**
 * The atlas surface as a browser addresses it: hash-api's `/atlas` mount.
 *
 * The atlas answers under the actor its caller names, so no browser path reaches that listener
 * directly. hash-api resolves the actor from the request's session and states it to the atlas
 * (`apps/hash-api/src/atlas-proxy.ts`), which is why this is hash-api's origin and why every request
 * below is credentialed. The atlas's own version prefix is that mount's concern, so no route here
 * carries one.
 */
export const ATLAS_API_BASE_URL = `${apiOrigin}/atlas`;

/**
 * The per-caller authority token's header.
 *
 * The manifest mints the token in this header; the four data routes present it back in the same one.
 *
 * Lowercase because `fetch` lowercases request header names and `Headers.get` matches
 * case-insensitively; the server's canonical spelling is `Atlas-Authority`. Reading it
 * cross-origin needs hash-api to name it in `Access-Control-Expose-Headers` — it does, from
 * `ATLAS_AUTHORITY_HEADER` in `apps/hash-api/src/atlas-proxy.ts`; without that line the read below
 * returns `null` and every data route takes a uniform `401` that looks like authority working.
 * Sending it back needs the same header allowed on the preflight, which is automatic: hash-api's
 * `CORS_CONFIG` states no `allowedHeaders`, and the `cors` package then reflects
 * `Access-Control-Request-Headers` verbatim.
 */
export const ATLAS_AUTHORITY_HEADER = "atlas-authority";

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
  /**
   * Human-readable label from the tile's detail trailer. Present only when the
   * tile was fetched with {@link FetchTileOptions.includeDetailedData}; the base
   * geometry-only response leaves it `undefined`.
   */
  readonly label?: string;
  /**
   * The entity's icon from the detail trailer — an emoji, or a `/path`/`https`
   * URL (never a design-system icon name); see the server's `detail.rs`.
   * Present only alongside {@link label} (detailed data); `undefined` otherwise.
   */
  readonly icon?: string;
  /**
   * Indices into the request's {@link FetchTileOptions.coloredTypeIds} the point
   * carries — index `i` is present when the point is the request's type `i` or
   * one of its descendants. Ascending, and empty when the point matches none of
   * the queried types. Present only when `coloredTypeIds` was sent (the
   * `TYPE_MASK` column rides exactly those requests); `undefined` otherwise.
   */
  readonly typeIndices?: readonly number[];
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
  /** Atlas API base, mount included. Defaults to {@link ATLAS_API_BASE_URL}. */
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
  /**
   * Requests the detail trailer — per-point labels (and icons) the server
   * hydrates live from the store — so decoded {@link TileNode}s carry a
   * `label`. Defaults to `false` (the geometry-only response). The detailed
   * view turns this on for the tiles it draws.
   */
  readonly includeDetailedData?: boolean;
  /**
   * Versioned type URLs conditioning the response's `TYPE_MASK` column, in the
   * order their bit index is assigned. When non-empty each decoded
   * {@link TileNode} carries {@link TileNode.typeIndices}, the queried types the
   * point (or one of its descendants) matches. Capped by the manifest's
   * `limits.coloredTypeIds`. Defaults to none (no `TYPE_MASK`, no
   * `typeIndices`).
   */
  readonly coloredTypeIds?: readonly string[];
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
 * (including the `404` that signals a re-pin) and non-HTTP errors such as a
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

/** One origin's authority state: the token its data routes present, and the renewal that replaces it. */
interface AtlasAuthority {
  /**
   * The token exactly as the server sent it, `undefined` until a manifest response mints one.
   *
   * Opaque, permanently, by the serving side's commitment: no client parses it, and its width has no
   * consumer here — deliberately not recorded, because a width written down is a width that goes
   * stale and gets believed. Retain the string, present the string.
   */
  token: string | undefined;
  /**
   * The manifest of the generation this origin's session pinned — the one route that mints, so the
   * one route that renews.
   */
  readonly manifestUrl: string;
  /** An in-flight renewal, shared so a viewport's simultaneous refusals cost one manifest fetch. */
  renewal: Promise<void> | undefined;
}

/** Authority state per atlas origin, created by that origin's bootstrap (see {@link fetchSaltileSession}). */
const authorityCache = new Map<string, AtlasAuthority>();

/**
 * Names the active authority/session population.
 *
 * Work that started against an earlier population of {@link authorityCache} and {@link sessionCache}
 * cannot publish into this one.
 *
 * Both a bootstrap and a renewal deliberately outlive their callers' signals — one caller aborting
 * must not poison a value the others await — so a response can arrive after everything it was for
 * has been dropped. Clearing the maps does not stop that work: retention resolves its entry by
 * origin at the moment the response lands, so a late token would be written into whatever entry now
 * occupies the origin, and a late bootstrap would install an entry of its own. Where the drop was a
 * change of authenticated principal, that is one principal's token published into another's
 * successor state.
 *
 * The rule this makes mechanical: **a request publishes only into the incarnation whose token it
 * presented.** {@link requestAtlasOnce} reads the incarnation in the same breath as the token and
 * hands it to {@link retainAtlasAuthority}, so the capture cannot drift from the presentation and no
 * route has to carry it. Anything stale is dropped rather than reconciled — there is nothing to
 * reconcile it against.
 *
 * It moves on EVERY clear, including one that dropped no session, and no test can distinguish that
 * from moving it only on a real drop — deliberately, because no case needs it: work in flight is
 * itself a pinned entry, so a clear with nothing to drop has nothing in flight to supersede. It is
 * unconditional because that argument is longer than the increment, and because the guard it feeds
 * is the opposite trade from the revision's: the revision withholds a bump to avoid discarding
 * painted tiles, while this one only ever refuses a write nobody is waiting for.
 *
 * It is one number for every origin, not one per origin, and that over-approximates in the same
 * deliberate direction as the revision: clearing one origin supersedes another origin's in-flight
 * bootstrap, which costs that bootstrap a retry of work whose result was still valid. Harmless while
 * one origin is the shipped shape — and every per-origin clear the transports make is for an origin
 * that did have a session, so the revision moves alongside and the retry is one the consumers were
 * doing anyway. A second live origin is the reason to key this by origin.
 */
let authorityIncarnation = 0;

/**
 * The authority state of the origin `url` addresses, or `undefined` where no session bootstrapped.
 *
 * The request's own URL names the origin, so no token is threaded through the transports: a data
 * route cannot send its request without presenting the token, a new route cannot forget to, and one
 * origin's token cannot reach another. The trailing `/` is load-bearing — without it a base of
 * `…/atlas` would match a request to `…/atlas-two/tile/…`.
 */
const authorityFor = (url: string): AtlasAuthority | undefined => {
  for (const [baseUrl, authority] of authorityCache) {
    if (url.startsWith(`${baseUrl}/`)) {
      return authority;
    }
  }
  return undefined;
};

/**
 * Retains a freshly minted token from any atlas response that carries one.
 *
 * Minting is a property of the *response* — the manifest is the only route that mints, and both the
 * bootstrap and the renewal go through it — so retention lives here rather than at either call site,
 * and neither of them reads a header. A response from an origin with no session is ignored: there is
 * nothing for its token to bind to.
 *
 * `incarnation` is the one from the request that produced `response` (see
 * {@link authorityIncarnation}). A token minted for a population that has since been dropped is
 * discarded, not written: the entry now at this origin belongs to whoever replaced it, and may
 * answer to a different principal entirely.
 */
const retainAtlasAuthority = (
  url: string,
  response: Response,
  incarnation: number,
): void => {
  const minted = response.headers.get(ATLAS_AUTHORITY_HEADER);
  if (minted === null) {
    return;
  }
  if (incarnation !== authorityIncarnation) {
    return;
  }
  const authority = authorityFor(url);
  if (authority === undefined) {
    return;
  }
  authority.token = minted;
};

/**
 * A single request that resolves only on a 2xx response and otherwise throws.
 *
 * `presentAuthority` presents the retained token on a request that carries no body; see
 * {@link renewAtlasAuthority}, the one caller that needs it.
 */
const requestAtlasOnce = async (
  url: string,
  accept: string,
  signal: AbortSignal | undefined,
  priority: RequestPriority | undefined,
  body: string | undefined,
  presentAuthority = false,
): Promise<Response> => {
  // Read with the token, not before it and not after the response: the incarnation this request may
  // publish into is the one whose token it is about to present (see `authorityIncarnation`).
  const incarnation = authorityIncarnation;
  // The four data routes require the token and are exactly the requests carrying a body, so the
  // presentation is derived rather than passed. The bootstrap `GET`s stay tokenless on purpose: a
  // custom header would turn two CORS-simple requests into preflighted ones. The refresh is the one
  // bodyless request that must present (`presentAuthority`), and pays that preflight to renew.
  const token =
    body !== undefined || presentAuthority
      ? authorityFor(url)?.token
      : undefined;
  const authority: Record<string, string> =
    token === undefined ? {} : { [ATLAS_AUTHORITY_HEADER]: token };

  let response: Response;
  try {
    // The session cookie is the request's other authority: hash-api resolves the actor from it and
    // the atlas answers under that actor, so a request sent without credentials is answered as the
    // public user rather than refused. The token seals that same actor, so it is a second wall
    // behind the cookie rather than a replacement for it.
    response =
      body === undefined
        ? await fetch(url, {
            headers: { accept, ...authority },
            credentials: "include",
            signal,
            priority,
          })
        : await fetch(url, {
            method: "POST",
            headers: {
              accept,
              "content-type": "application/json",
              ...authority,
            },
            credentials: "include",
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
  retainAtlasAuthority(url, response, incarnation);
  return response;
};

/**
 * Renews the authority token of the origin `url` addresses.
 *
 * Re-fetches the manifest of the generation that origin's session pinned, presenting the expiring
 * token.
 *
 * Deliberately **not** a re-bootstrap. {@link clearAtlasSessionCache} always moves the session
 * revision when it drops a session, so routing an expiry through it would discard every painted tile
 * once per token window — reading as a periodic stall, and replacing progressive state on a mere
 * rotation of token bytes, which the serving contract forbids. Presenting the old token instead is
 * meant to make view continuity the server's job by construction: it reads the view state sealed in
 * the presented token (expiry is the expected presentation here, and forgiven) and re-mints with it
 * verbatim, so the fresh token names the same view. Nothing about the view is read, retained or
 * compared on this side.
 *
 * **CONDITIONAL ON THE SERVING SIDE REFUSING A PRESENT-BUT-INVALID TOKEN.** A `200` here may
 * preserve painted state only where an invalid presentation — bad tag, wrong actor — is refused
 * rather than read as no token at all. Where absent and invalid collapse into one "nothing carried",
 * the manifest answers `200` with a freshly bootstrapped view, so a `200` proves a successful
 * bootstrap and not carried continuity, and the tiles kept across it may belong to a different view.
 * Do not paper over that here: the missing distinction is a status code this side cannot synthesise,
 * and the repair that suggests itself — bootstrapping afresh on a refusal — is precisely how one
 * actor's view is adopted into another's painted state.
 *
 * Only the header is consumed; the document is **discarded**. A refresh is not a configuration
 * re-read — the manifest is immutable per generation, so the schedule and limits stay the ones the
 * bootstrap resolved.
 *
 * A `404` is not a failed renewal but a re-pin: the pinned generation is no longer served. It
 * travels to the caller as the refusal, where the pre-existing generation-refresh path (see
 * {@link fetchTile}) re-bootstraps and replaces the store — so the two recoveries compose without
 * either knowing about the other.
 *
 * A `401` here — the manifest refusing a present-but-invalid token — is **terminal**, and terminal
 * means untouched: the held token is not swapped, the session is not dropped, the revision does not
 * move, and no fresh session is adopted into a store painted under the old one. There is a test
 * pinning each of those, because the tempting repair (a fresh bootstrap on a refused renewal) is
 * exactly how a different actor's view would be adopted into this one's painted state.
 *
 * The renewal is shared per origin and untied to any caller's `signal`, for the same reason the
 * bootstrap is: one caller aborting must not poison the value the others await. It carries the
 * standard retry policy, so a transient blip at the manifest does not turn an expiring token into a
 * failed viewport — the refusal that started it is already past retrying by then.
 *
 * @returns whether a renewal ran — `false` when the origin has no session to renew, which leaves
 *   the refusal terminal.
 */
const renewAtlasAuthority = async (url: string): Promise<boolean> => {
  const authority = authorityFor(url);
  if (authority === undefined) {
    return false;
  }

  authority.renewal ??= withAtlasRetry(() =>
    requestAtlasOnce(
      authority.manifestUrl,
      "application/json",
      undefined,
      undefined,
      undefined,
      true,
    ),
  )
    .then(() => undefined)
    .finally(() => {
      authority.renewal = undefined;
    });

  await authority.renewal;
  return true;
};

/**
 * Requests `url`, retrying transient failures, resolving only on a 2xx
 * response. A `body` sends it as a JSON `POST`; otherwise it is a `GET`. Shared
 * with the edges transport (`fetch-edges-for-tiles.ts`).
 *
 * A `401` on a data route renews the authority token once and retries (see
 * {@link renewAtlasAuthority}); `presentAuthority` is that renewal's own flag.
 */
export const requestAtlas = async (
  url: string,
  accept: string,
  signal: AbortSignal | undefined,
  retries?: number,
  priority?: RequestPriority,
  body?: string,
  presentAuthority?: boolean,
): Promise<Response> => {
  const attempt = (): Promise<Response> =>
    withAtlasRetry(
      () =>
        requestAtlasOnce(url, accept, signal, priority, body, presentAuthority),
      { signal, retries },
    );

  try {
    return await attempt();
  } catch (error) {
    // The uniform `401` is this client's only clock: the token is opaque, so its expiry is
    // unreadable, and the refusal names no cause — an expiry, a re-mint and a revocation are
    // deliberately indistinguishable. Renewing and retrying exactly once covers all three, and
    // only a request that presents a token can be refused for one, hence the `body` guard. The
    // renewal's own request cannot recur here: it goes to {@link requestAtlasOnce} directly.
    if (
      body === undefined ||
      !(error instanceof FetchTileError) ||
      error.status !== 401 ||
      !(await renewAtlasAuthority(url))
    ) {
      throw error;
    }
    // A second refusal is terminal: it is no longer a stale token.
    return await attempt();
  }
};

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

/**
 * Immutable identities and schedule that bind every tile of one generation.
 *
 * Shared with the edges transport (`fetch-edges-for-tiles.ts`) via
 * {@link getSaltileSession}, so a viewport's tile and edge fetches bind to the
 * same generation and share one bootstrap.
 */
export interface SaltileSession {
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
  /** Cap on the tile list of one edges request (manifest `limits.edgesTiles`). */
  readonly edgesTiles: number;
}

/** The bootstrap and refresh route of one generation: the only route that mints an authority token. */
const manifestUrl = (baseUrl: string, generation: string): string =>
  `${baseUrl}/generation/${generation}/manifest`;

const fetchSaltileSession = async (
  baseUrl: string,
): Promise<SaltileSession> => {
  const incarnation = authorityIncarnation;
  // `current` names the active generation; its manifest carries the canonical
  // variant set, bucket schedule, and max zoom. The reads are deliberately not
  // tied to any caller's AbortSignal: the result is shared across every tile
  // fetch, so one caller aborting must not poison the memoized value.
  const current = parseCurrent(
    await fetchAtlasJson(`${baseUrl}/current`, undefined),
  );
  const url = manifestUrl(baseUrl, current.generation);

  // Register this origin's authority before the response that mints one arrives: retention finds an
  // origin by the request's URL, so an unregistered origin would silently drop its token and take a
  // uniform `401` on every data route. A fresh bootstrap starts tokenless by construction — the
  // manifest below is what fills it in.
  //
  // Unless this bootstrap is already stale: `current` is a network round trip, and an incarnation
  // that moved during it means everything this bootstrap is for has been dropped — so the write
  // would install an entry nobody asked for, or replace the entry of whoever bootstrapped next.
  // Failing is the whole recovery: the memoized promise this rejects was removed by the same drop,
  // and its awaiting callers belong to the population that was dropped.
  if (incarnation !== authorityIncarnation) {
    throw new FetchTileError(
      `Atlas bootstrap for ${baseUrl} was superseded before it could publish`,
    );
  }
  authorityCache.set(baseUrl, {
    token: undefined,
    manifestUrl: url,
    renewal: undefined,
  });

  const manifest = parseManifest(
    await fetchAtlasJson(url, undefined),
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
    edgesTiles: manifest.limits.edgesTiles,
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

/**
 * The memoized SALTILE session for `baseUrl`, bootstrapping it on first use.
 * Shared by the tile and edges transports so both bind to one generation; a
 * `404` on either route re-bootstraps through {@link clearAtlasSessionCache}.
 */
export const getSaltileSession = (baseUrl: string): Promise<SaltileSession> => {
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
 * Monotonic name for the generation binding the memoized sessions carry. It
 * moves exactly when a pinned generation is dropped (see
 * {@link clearAtlasSessionCache}), which in practice needs the server to have
 * stopped serving it: the atlas serves one generation per process, pinned at its
 * startup, so a session's tiles are one generation by construction and only a
 * process the session outlived (a restart, a redeploy, another replica) puts it
 * on a different one — through the `404` refresh in {@link fetchTile}.
 *
 * That moment is not a staleness boundary but an attribution one: every wire row
 * id is a keyed permutation salted by the generation identity, so a tile decoded
 * under the retired generation does not fail to decode under the new one — it
 * decodes to a *different, existing* row. Nothing downstream can detect that,
 * because the ids it yields are valid. Anything holding decoded tiles must
 * therefore discard them on a change rather than keep or remap them; no remap
 * exists.
 */
let sessionRevision = 0;
const sessionRevisionListeners = new Set<() => void>();

/**
 * The current generation binding's revision (see {@link sessionRevision}).
 * Paired with {@link subscribeToAtlasSessionRevision} it is a
 * `useSyncExternalStore` source, so React state that composites decoded tiles —
 * the `TileCache` behind `useGetViewportNodes` — can name the binding its
 * contents belong to and be replaced when that binding changes.
 */
export const getAtlasSessionRevision = (): number => sessionRevision;

/**
 * Subscribes `listener` to changes of {@link getAtlasSessionRevision}, returning
 * its unsubscribe. Listeners are called synchronously, after the drop.
 */
export const subscribeToAtlasSessionRevision = (
  listener: () => void,
): (() => void) => {
  sessionRevisionListeners.add(listener);
  return () => {
    sessionRevisionListeners.delete(listener);
  };
};

/**
 * Drops the memoized active-generation session and the authority token it minted, forcing the next
 * {@link fetchTile} call to re-bootstrap, and — when a session was actually
 * pinned — moves {@link getAtlasSessionRevision} so holders of decoded tiles
 * discard them. Pass a `baseUrl` to clear one origin, or omit it to clear all.
 *
 * This is the re-pin door, not the token-expiry door: an expiring token is renewed in place by
 * {@link renewAtlasAuthority}, which keeps every painted tile.
 */
export const clearAtlasSessionCache = (baseUrl?: string): void => {
  // Unconditionally, and before anything is dropped: from here on, work that started earlier may not
  // publish (see {@link authorityIncarnation}).
  authorityIncarnation += 1;
  let dropped: boolean;
  if (baseUrl === undefined) {
    dropped = sessionCache.size > 0;
    sessionCache.clear();
    authorityCache.clear();
  } else {
    dropped = sessionCache.delete(baseUrl);
    authorityCache.delete(baseUrl);
  }
  // The token goes with the session that minted it: it seals view state resolved under the dropped
  // generation, and the next generation's key refuses it as a forgery rather than as an expiry, so
  // keeping it would buy one wasted round trip and nothing else. No test distinguishes these two
  // lines, because the re-bootstrap replaces the whole entry anyway (see
  // {@link fetchSaltileSession}); they are here so that the invariant — no session, no token — is
  // stated where the session is dropped rather than resting on the order of the bootstrap's writes.

  // Only a real drop can change the binding: clearing an origin that pinned
  // nothing would otherwise throw away live, correctly-attributed tiles. The
  // converse over-approximates deliberately — a re-bootstrap landing on the same
  // generation (a `404` from a replica that had not caught up, say) still moves
  // the revision, costing a refetch, never a composite that mixes generations.
  if (!dropped) {
    return;
  }
  sessionRevision += 1;
  // Copied: a listener may unsubscribe (or subscribe) while being notified.
  for (const listener of sessionRevisionListeners) {
    listener();
  }
};

/**
 * Drops everything this module holds when the authenticated principal changes.
 *
 * The drop goes through the same door as a re-pin.
 *
 * Registered at module load rather than wired from a consumer, so the transport cannot be imported
 * without its reset (see `shared/principal-scoped-state.ts` for the placement contract and why the
 * auth layer does not import this file).
 *
 * WHY THE WHOLE SESSION, AND WHY THE TOKEN. The session is not actor-scoped — one generation serves
 * every actor — but the tiles decoded under it are: each row a tile yields is a row the *previous*
 * principal was allowed to see, and a principal change is an attribution boundary exactly like a
 * re-pin. The token is worse than useless to the new principal: it seals the actor hash-api resolved
 * for the old one, so every data route refuses it. Clearing here also keeps the revision guard
 * honest — {@link clearAtlasSessionCache} moves the revision only when it really dropped a session,
 * which is sufficient because nothing can be painted without one: a tile fetch needs a resolved
 * session, and dropping the session is what discards the tiles.
 *
 * LIVENESS, not only attribution, and it is why this reset is required rather than tidy. Where the
 * manifest bootstraps a fresh scope for a token it cannot open, a retained token costs the new
 * principal one wasted round trip and self-heals. Where that presentation is refused instead — the
 * behaviour {@link renewAtlasAuthority} depends on for its continuity claim — the renewal answers
 * `401`, which this client treats as TERMINAL and correctly refuses to paper over with a fresh
 * bootstrap. Without this reset the new principal's graph would then never load at all, until a
 * reload.
 */
registerPrincipalScopedReset(() => {
  clearAtlasSessionCache();
});

/**
 * Reads the LSB-first type bitmask for the point at `index` into the ascending
 * list of matched {@link FetchTileOptions.coloredTypeIds} indices. `stride` is
 * the per-point byte count (`ceil(count / 8)`); bit `k` of byte `b` names the
 * queried type at index `b * 8 + k`. `count` caps the scan so padding bits in
 * the final byte are never read as types. Shared with the locate transport
 * (`fetch-locate.ts`), whose TYPE_MASK column is laid out identically.
 */
export const typeIndicesAt = (
  typeMask: Uint8Array,
  index: number,
  stride: number,
  count: number,
): number[] => {
  const indices: number[] = [];
  const base = index * stride;
  for (let byte = 0; byte < stride; byte += 1) {
    // Arithmetic bit-walk (the codebase bans bitwise operators): the low bit is
    // the parity, and dividing by two shifts the next bit down, so bits are read
    // LSB-first — the order the wire assigns type indices within a byte.
    let bits = typeMask[base + byte] ?? 0;
    for (let bit = 0; bit < 8; bit += 1) {
      const type = byte * 8 + bit;
      if (type >= count) {
        break;
      }
      if (bits % 2 === 1) {
        indices.push(type);
      }
      bits = Math.floor(bits / 2);
    }
  }
  return indices;
};

const fetchAndDecodeTile = async (
  session: SaltileSession,
  coordinate: AtlasTileCoordinate,
  baseUrl: string,
  signal: AbortSignal | undefined,
  retries: number | undefined,
  priority: RequestPriority | undefined,
  includeDetailedData: boolean,
  coloredTypeIds: readonly string[],
): Promise<FetchedTile> => {
  const { z, x, y } = coordinate;
  if (z > session.maxZoom) {
    throw new FetchTileError(
      `zoom ${z} is beyond the manifest maxZoom ${session.maxZoom}`,
    );
  }

  const tileUrl = `${baseUrl}/tile/${session.generation}/${session.variant}/${z}/${x}/${y}`;
  // Delta mode. `coloredTypeIds` conditions the TYPE_MASK column, and the detail
  // trailer (per-point labels and icons) rides only when the caller asks; an
  // empty query serializes to `{}`, the all-defaults body.
  const body = JSON.stringify({
    ...(coloredTypeIds.length > 0 ? { coloredTypeIds } : {}),
    ...(includeDetailedData ? { includeDetailedData: true } : {}),
  });
  const tileResponse = await requestAtlas(
    tileUrl,
    SALTILE_MEDIA_TYPE,
    signal,
    retries,
    priority,
    body,
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
    coloredTypeIdCount: coloredTypeIds.length,
    includeDetailedData,
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
  const { delivered, positions, rowIds, typeMask } = tile;
  // The detail trailer's columns are delivered-order-aligned; absent (null) on
  // the geometry-only response, so a node simply carries no label/icon there.
  const labels = tile.detail?.labels;
  const icons = tile.detail?.icons;
  // The type mask is present exactly when colored types were requested; its
  // stride is the per-point byte count carrying one bit per queried type.
  const maskStride = Math.ceil(coloredTypeIds.length / 8);
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
    const worldX = (wireX + 1) * scale;
    const worldY = (wireY + 1) * scale;
    const label = labels?.[index] ?? undefined;
    const icon = icons?.[index] ?? undefined;
    const typeIndices = typeMask
      ? typeIndicesAt(typeMask, index, maskStride, coloredTypeIds.length)
      : undefined;
    nodes[index] = {
      id,
      x: worldX,
      y: worldY,
      ...(label !== undefined ? { label } : {}),
      ...(icon !== undefined ? { icon } : {}),
      ...(typeIndices !== undefined ? { typeIndices } : {}),
    };
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
  const {
    baseUrl = ATLAS_API_BASE_URL,
    signal,
    retry,
    priority,
    includeDetailedData = false,
    coloredTypeIds = [],
  } = options;

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
      includeDetailedData,
      coloredTypeIds,
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
        includeDetailedData,
        coloredTypeIds,
      );
    }
    throw error;
  }
};
