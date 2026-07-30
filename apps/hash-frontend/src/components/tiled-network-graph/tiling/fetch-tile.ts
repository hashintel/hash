/**
 * The Atlas tile transport.
 *
 * Fetches one Atlas quadtree tile over the SALTILE wire (Surface v1) and
 * decodes it into renderable node records.
 *
 * The flow mirrors the serving contract:
 *
 *  1. Bootstrap a session: read `GET /atlas/current` for the active
 *     generation, then `POST` its immutable manifest, bodyless (canonical
 *     variant, bucket schedule, max zoom). The session binds every tile to one generation and
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
 * Terminal failures (`4xx`, a decode mismatch) are not retried; a `401`, meaning
 * the authority token no longer admits the request, has its own one-shot token
 * renewal in {@link requestAtlas}, while the two failures that end a session — a
 * `404`, meaning the pinned generation is no longer served, and a renewal the
 * server refuses — share one session replacement in {@link fetchTile} (see
 * {@link canReplaceAtlasSession}).
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
  /** The refusal's RFC 9457 `type`, when the response carried a problem document. */
  readonly problem?: string;
}

/** A tile could not be fetched, was rejected by the server, or failed to decode. */
export class FetchTileError extends Error {
  override readonly name = "FetchTileError";
  /** Present when the failure originated from a non-2xx HTTP response. */
  readonly status: number | undefined;
  /**
   * The refusal's RFC 9457 `type` — the atlas's stable root-relative problem URI, e.g.
   * {@link ATLAS_RETIRED_GENERATION_PROBLEM}.
   *
   * Present only when the response carried a problem document naming one. A status alone does not
   * say what was refused: the atlas answers `404` for a generation it no longer serves *and* for a
   * locate whose source names no visible node, and those two ask for opposite handling.
   */
  readonly problem: string | undefined;

  constructor(message: string, options?: FetchTileErrorOptions) {
    super(message, options);
    this.status = options?.status;
    this.problem = options?.problem;
  }
}

/**
 * The atlas's problem type for a generation it does not serve — a re-pin, and the only `404` that
 * ends a session.
 *
 * Part of the served contract rather than a detail: the atlas publishes these URIs as stable
 * root-relative identifiers, which is what makes a refusal readable by something other than its
 * status. The client depends on this one because the recovery it triggers is destructive, so it must
 * be the refusal the server actually named.
 */
export const ATLAS_RETIRED_GENERATION_PROBLEM =
  "/problems/atlas/unknown-generation";

/**
 * A session's authority was refused at its own renewal.
 *
 * The distinction this class exists to carry: an ordinary `401` reaching a caller means a data route
 * refused a token the manifest had just minted — nothing about the session is stale, and a
 * re-bootstrap would buy a wasted round trip and discard live rows. This error, by contrast, means the renewal
 * itself was refused, where an expiry would have been forgiven, so the session's authority is not
 * one the server will admit again and the session cannot be continued at all (see
 * {@link canReplaceAtlasSession}, its only consumer).
 *
 * It is minted at the one place that can tell the two apart — the caller of
 * {@link renewAtlasAuthority} — so no route decides, and a route that forgot to would get the
 * conservative behaviour rather than a destructive one.
 */
export class AtlasAuthorityEndedError extends FetchTileError {}

const abortError = (signal: AbortSignal | undefined): FetchTileError =>
  new FetchTileError("Atlas request aborted", { cause: signal?.reason });

/**
 * Whether a failure is worth retrying.
 *
 * Retried: a transport error (no HTTP status reached us) or the server asking us
 * to try again (`429`, `5xx`). Terminal failures — `4xx` (including the `404`
 * that signals a re-pin) and non-HTTP errors such as a decode mismatch — are
 * not.
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
const readErrorDetail = async (
  response: Response,
): Promise<{ detail: string; problem: string | undefined }> => {
  const text = await response.text().catch(() => "");
  try {
    const body: unknown = JSON.parse(text);
    if (typeof body === "object" && body !== null) {
      const problem =
        "type" in body && typeof body.type === "string" ? body.type : undefined;
      if ("detail" in body && typeof body.detail === "string") {
        return { detail: body.detail, problem };
      }
      if ("error" in body && typeof body.error === "string") {
        return { detail: body.error, problem };
      }
      return { detail: text, problem };
    }
  } catch {
    // Not a JSON body; fall back to the raw text below.
  }
  return {
    detail: text || response.statusText || "no error detail",
    problem: undefined,
  };
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
   * This origin's pinned generation manifest.
   *
   * The one route that mints, so the one route that renews.
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
 * It moves on every clear, including one that dropped no session, and no test can distinguish that
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
 * origin's token cannot reach another. The trailing `/` holds the match to a path boundary —
 * without it a base of `…/atlas` would also match a request to `…/atlas-two/tile/…`.
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
 * What an atlas request is for — the one property of a request this transport does not derive.
 *
 * Method, token presentation and renewal eligibility all follow from the role, so no call site
 * chooses any of them. The role is stated rather than read off the request because nothing in a
 * request's shape identifies it: the manifest and the four data routes are all `POST`, and a
 * bodyless manifest renewal presents the same token a data route does. A transport that inferred the
 * role from the shape would answer the manifest's own refusal by renewing authority at the
 * manifest — the request that just failed — and recur.
 *
 * `data` carries its body inside the role rather than beside it, so a data request cannot be built
 * without one and no other role can acquire one by accident.
 */
type AtlasRequest =
  /** Names the generation to pin: the one `GET` here, and tokenless. */
  | { readonly role: "current" }
  /**
   * Mints the authority of a fresh view. Bodyless and tokenless, so it stays a CORS-simple request.
   *
   * Its tokenlessness is doubly determined and no test can distinguish the two: this role presents
   * nothing, and the entry the bootstrap installs holds no token to present (see
   * {@link fetchSaltileSession}). The role is the half a reader can see at the request.
   */
  | { readonly role: "manifest-bootstrap" }
  /** Re-mints the authority of the view sealed in the retained token, which it presents. */
  | { readonly role: "manifest-renewal" }
  /** One of the four routes requiring the token, and the only role whose `401` can be a stale one. */
  | { readonly role: "data"; readonly body: string };

/**
 * A single request that resolves only on a 2xx response and otherwise throws.
 *
 * Sends what `request`'s role says it is (see {@link AtlasRequest}): `current` as a `GET` and every
 * other role as a `POST`, presenting the retained token on the two roles the server requires it
 * from, with a JSON body on the one role that carries one.
 */
const requestAtlasOnce = async (
  url: string,
  accept: string,
  request: AtlasRequest,
  signal: AbortSignal | undefined,
  priority: RequestPriority | undefined,
): Promise<Response> => {
  // Read with the token, not before it and not after the response: the incarnation this request may
  // publish into is the one whose token it is about to present (see `authorityIncarnation`).
  const incarnation = authorityIncarnation;
  const body = request.role === "data" ? request.body : undefined;
  // The data routes require the token, and the renewal presents the expiring one because presenting
  // it is what carries the view across the re-mint. The other two roles are tokenless: `current` has
  // nothing to present, and a bootstrap presenting a token would ask to continue the very view it is
  // replacing. Being tokenless also keeps them CORS-simple, where a custom header costs a preflight.
  const token =
    request.role === "data" || request.role === "manifest-renewal"
      ? authorityFor(url)?.token
      : undefined;

  let response: Response;
  try {
    // The session cookie is the request's other authority: hash-api resolves the actor from it and
    // the atlas answers under that actor, so a request sent without credentials is answered as the
    // public user rather than refused. The token seals that same actor, so it is a second wall
    // behind the cookie rather than a replacement for it.
    response = await fetch(url, {
      method: request.role === "current" ? "GET" : "POST",
      headers: {
        accept,
        // Only a body needs its type stated, and only a body-carrying request may state one. A
        // content type on a bodyless `POST` describes a document that does not exist, and buys the
        // request a preflight for it: `content-type` leaves the safelist as soon as its value is
        // `application/json`, so the browser asks permission before sending.
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(token === undefined ? {} : { [ATLAS_AUTHORITY_HEADER]: token }),
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
    const { detail, problem } = await readErrorDetail(response);
    throw new FetchTileError(
      `Atlas responded ${response.status} for ${url}: ${detail}`,
      { status: response.status, problem },
    );
  }
  retainAtlasAuthority(url, response, incarnation);
  return response;
};

/**
 * Reads the name of the generation to pin.
 *
 * The one atlas route this client reaches with a `GET`, and the one that neither mints authority nor
 * presents it: it is asked before any session exists. Its method lives here, so no caller states it.
 */
const requestCurrent = (url: string): Promise<Response> =>
  withAtlasRetry(() =>
    requestAtlasOnce(
      url,
      "application/json",
      { role: "current" },
      undefined,
      undefined,
    ),
  );

/**
 * Fetches a generation manifest: the one route that mints an authority token, in one of its two
 * roles.
 *
 * The manifest's method lives here and nowhere else. It is a `POST` route, so its requests are
 * indistinguishable by shape from the data routes' — which is why the role travels as a role (see
 * {@link AtlasRequest}) and why both manifest call sites come through this function rather than
 * describing the route themselves. A body is the filter document's, and this client sends none, so a
 * manifest request here is bodyless in both roles.
 *
 * Neither role is tied to a caller's `signal`, for the same reason the bootstrap is not: one caller
 * aborting must not poison a value the others await.
 */
const requestManifest = (
  url: string,
  role: "manifest-bootstrap" | "manifest-renewal",
): Promise<Response> =>
  withAtlasRetry(() =>
    requestAtlasOnce(url, "application/json", { role }, undefined, undefined),
  );

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
 * Keeping painted rows across the `200` rests on the serving contract refusing an invalid
 * presentation — a bad tag or another actor's token — rather than reading it as no token at all.
 * Where those collapse into one "nothing carried", the manifest answers `200` with a freshly
 * bootstrapped view, and a `200` then proves a bootstrap rather than carried continuity, so the rows
 * kept across it may belong to a different view. That distinction is a status code this side cannot
 * synthesise: it is the refusal below.
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
 * A `401` here — the manifest refusing the token it minted, where an expiry is forgiven — ends the
 * session rather than the request: authority that its own renewal refuses cannot be continued, only
 * replaced. This function does not replace it.
 * The refusal travels to the caller, where the session's owner drops it and re-bootstraps (see
 * {@link canReplaceAtlasSession}) — the same door, in the same order, that a `404` re-pin already
 * uses, so the two recoveries stay one recovery. Recovering here would be the wrong site twice over:
 * this layer holds no session promise to check its own staleness against, and a renewal deliberately
 * outlives its callers' signals, so a refusal can land after everything it addressed was dropped.
 *
 * The renewal is shared per origin, so a viewport's simultaneous refusals cost one manifest fetch. It
 * carries the standard retry policy, so a transient blip at the manifest does not turn an expiring
 * token into a failed viewport — while the refusal that started it is already past retrying.
 *
 * @returns whether a renewal ran — `false` when the origin has no session to renew, which leaves the
 *   caller's refusal terminal.
 * @throws the manifest's own refusal, which {@link requestAtlas} turns into an
 *   {@link AtlasAuthorityEndedError} for the session's owner.
 */
const renewAtlasAuthority = async (url: string): Promise<boolean> => {
  const authority = authorityFor(url);
  if (authority === undefined) {
    return false;
  }

  authority.renewal ??= requestManifest(
    authority.manifestUrl,
    "manifest-renewal",
  )
    .then(() => undefined)
    .finally(() => {
      authority.renewal = undefined;
    });

  await authority.renewal;
  return true;
};

/**
 * Requests one of the four data routes, retrying transient failures.
 *
 * Resolves only on a 2xx response. `body` is the route's JSON request document and is required,
 * because a request without one is not a data route: that is the same fact as the two below, and
 * having it in the signature is what keeps a manifest fetch from arriving here. Shared with the edges
 * and locate transports (`fetch-edges-for-tiles.ts`, `fetch-locate.ts`).
 *
 * These routes present the authority token, so a `401` here renews it once and retries (see
 * {@link renewAtlasAuthority}). Where the renewal is itself refused, the failure that reaches the
 * caller is an {@link AtlasAuthorityEndedError} — the session is over rather than the request, and
 * replacing it belongs to whoever pinned it.
 */
export const requestAtlas = async (
  url: string,
  accept: string,
  body: string,
  signal?: AbortSignal,
  retries?: number,
  priority?: RequestPriority,
): Promise<Response> => {
  const attempt = (): Promise<Response> =>
    withAtlasRetry(
      () =>
        requestAtlasOnce(url, accept, { role: "data", body }, signal, priority),
      { signal, retries },
    );

  try {
    return await attempt();
  } catch (error) {
    // The uniform `401` is this client's only clock: the token is opaque, so its expiry is
    // unreadable, and the refusal names no cause — an expiry, a re-mint and a withdrawal are
    // deliberately indistinguishable. Renewing and retrying exactly once covers all three. Only a
    // request that presents a token can be refused for one, which is why this is the data routes'
    // entry point and no other role's: the manifest's own requests go to {@link requestAtlasOnce}
    // through {@link requestManifest}, so a refused renewal cannot recur here.
    if (!(error instanceof FetchTileError) || error.status !== 401) {
      throw error;
    }
    let renewed: boolean;
    try {
      renewed = await renewAtlasAuthority(url);
    } catch (refusal) {
      // The renewal was refused rather than failed: the session's own authority is no longer
      // admitted, so the session is over. Naming that here is what lets the session's owner replace
      // it without confusing it with a data route refusing a freshly minted token (see
      // {@link AtlasAuthorityEndedError}).
      if (refusal instanceof FetchTileError && refusal.status === 401) {
        throw new AtlasAuthorityEndedError(
          `Atlas responded 401 to the authority renewal for ${url}`,
          { status: 401, cause: refusal },
        );
      }
      throw refusal;
    }
    if (!renewed) {
      throw error;
    }
    // A second refusal is terminal: it is no longer a stale token.
    return await attempt();
  }
};

/** Reads a JSON document from an atlas response, naming the route in the failure. */
const readAtlasJson = async (
  url: string,
  response: Response,
): Promise<unknown> => {
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
  // variant set, bucket schedule, and max zoom. Neither read is tied to a
  // caller's AbortSignal: the result is shared across every tile fetch, so one
  // caller aborting must not poison the memoized value.
  const currentUrl = `${baseUrl}/current`;
  const current = parseCurrent(
    await readAtlasJson(currentUrl, await requestCurrent(currentUrl)),
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

  // Tokenless by role, which is what makes it a bootstrap: the manifest resolves a fresh view rather
  // than re-minting the authority of one this client no longer holds a usable token for.
  const manifest = parseManifest(
    await readAtlasJson(url, await requestManifest(url, "manifest-bootstrap")),
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
 * Memoized session promise per origin. A session outlives every viewport that uses it, so this is
 * held until something ends it: a `404` saying the pinned generation is no longer served, a refused
 * renewal saying its authority is no longer admitted (both through {@link canReplaceAtlasSession}),
 * or a direct {@link clearAtlasSessionCache}. Caching the promise (not the resolved value) also
 * collapses the concurrent first-callers of a fresh viewport into a single bootstrap, and gives every
 * caller a name for the population it belongs to.
 */
const sessionCache = new Map<string, Promise<SaltileSession>>();

/**
 * The memoized SALTILE session for `baseUrl`, bootstrapping it on first use.
 * Shared by the tile and edges transports so both bind to one generation; a
 * session either transport finds unusable is replaced through
 * {@link clearAtlasSessionCache} (see {@link canReplaceAtlasSession}).
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
 * Whether `error` ends the session `pinned` resolved, and this caller may replace it.
 *
 * Two failures end a session, arriving from opposite directions. A `404` naming
 * {@link ATLAS_RETIRED_GENERATION_PROBLEM} says the generation this session pinned is no longer
 * served — a re-pin. An {@link AtlasAuthorityEndedError} says its own renewal was refused, and an
 * expiry is forgiven at that renewal, so the authority is one the server will not admit again.
 * Neither is recoverable in place: the recovery for both is to drop the session and bootstrap a new
 * one without a token, then retry once. A refusal after that is terminal — a bootstrap presenting no
 * token cannot be refused for authority.
 *
 * The status alone will not do, and reading it alone was wrong: the atlas answers `404` for a locate
 * whose source names no visible node too, so searching for an entity outside the current generation
 * would drop the session and discard every painted tile on its way to re-throwing the same refusal.
 * A `404` therefore ends a session only when the refusal names the retired generation. One that names
 * anything else — or carries no problem document at all, which no atlas refusal does — leaves the
 * session alone: an unreadable refusal is the last thing that should authorise a destructive act.
 *
 * A plain `401` is deliberately absent from this set: it means a data route refused a token the manifest
 * had just minted, so nothing is stale, a re-bootstrap cannot help, and taking one would discard live
 * rows for a refusal that will recur.
 *
 * **`pinned` is the promise the caller awaited, not the session it resolved, and comparing it against
 * the cache is what makes the recovery non-destructive.** A bootstrap and a renewal both outlive their
 * callers' signals on purpose, so a refusal can land after the session it addressed was dropped and
 * replaced — by a principal transition, say. An unconditional clear would then erase a successor's
 * session, token and painted rows on the word of a request that never addressed them. A caller whose
 * pinned session is no longer the cached one has been superseded: it fails, and touches nothing.
 *
 * The check is an identity comparison rather than a remembered flag because the memoized promise is
 * already the population's name: it is replaced exactly when the population is.
 */
const canReplaceAtlasSession = (
  error: unknown,
  baseUrl: string,
  pinned: Promise<SaltileSession>,
): boolean =>
  (error instanceof AtlasAuthorityEndedError ||
    (error instanceof FetchTileError &&
      error.status === 404 &&
      error.problem === ATLAS_RETIRED_GENERATION_PROBLEM)) &&
  sessionCache.get(baseUrl) === pinned;

/**
 * Monotonic name for the session binding the memoized sessions carry: dropping a pinned session moves
 * it, and nothing else does (see {@link clearAtlasSessionCache}).
 *
 * A session is dropped for three reasons, and only one of them changes the generation. A `404`
 * re-pins to whatever `current` now names — which needs the atlas process the session bootstrapped
 * against to have been replaced, since one process serves one generation, pinned at its startup, so a
 * session's tiles are one generation by construction. A refused renewal ends the session's authority
 * with the generation standing still. A change of authenticated principal replaces the actor every
 * row was resolved for. This is therefore the session's name and not the generation's: a holder of
 * decoded rows learns that its rows belong to a session that is gone, never which generation is
 * current.
 *
 * What every drop shares is that it is an attribution boundary rather than a staleness one, and for
 * two distinct reasons. Across a re-pin, every wire row id is a keyed permutation salted by the
 * generation identity, so a tile decoded under the retired generation does not fail to decode under
 * the new one — it decodes to a *different, existing* row. Within one generation, a replacement
 * session answers for a different view or a different actor, so its predecessor's rows are not the
 * rows it would deliver. Neither is detectable downstream, because the ids in hand stay valid.
 * Anything holding decoded rows must therefore discard them on a change rather than keep or remap
 * them; no remap exists.
 */
let sessionRevision = 0;
const sessionRevisionListeners = new Set<() => void>();

/**
 * The current session binding's revision (see {@link sessionRevision}).
 * Paired with {@link subscribeToAtlasSessionRevision} it is a
 * `useSyncExternalStore` source, so React state that composites decoded rows —
 * the `TileCache` behind `useGetViewportNodes` — can name the session its
 * contents belong to and be replaced when that session is.
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
 * Drops a pinned session and the authority token it minted.
 *
 * The next {@link fetchTile} call re-bootstraps, and — when a session really was
 * pinned — {@link getAtlasSessionRevision} moves so holders of decoded rows
 * discard them. Pass a `baseUrl` to clear one origin, or omit it to clear all.
 *
 * The one door for every session replacement: a re-pin, a refused renewal, and a change of
 * authenticated principal all arrive here. Never the token-expiry door — an expiring token is renewed
 * in place by {@link renewAtlasAuthority}, which keeps every painted row, while a renewal the server
 * refuses arrives here, because authority its own renewal will not admit cannot be continued and the
 * rows resolved under it must go before a new session is minted.
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
  // The token goes with the session that minted it: it seals the view that session resolved, and the
  // successor resolves its own — so keeping it would either be refused or continue a view nobody
  // holds rows for, and either way buys one wasted round trip and nothing else. No test distinguishes
  // these two lines, because the re-bootstrap replaces the whole entry anyway (see
  // {@link fetchSaltileSession}); they are here so that the invariant — no session, no token — is
  // stated where the session is dropped rather than resting on the order of the bootstrap's writes.

  // Only a real drop can change the binding: clearing an origin that pinned
  // nothing would otherwise throw away live, correctly-attributed rows. The
  // converse over-approximates deliberately — a re-bootstrap landing on the same
  // generation (a `404` from a replica that had not caught up, say) still moves
  // the revision, costing a refetch, never a composite that mixes sessions.
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
 * Runs `operation` under the session for `baseUrl`, replacing that session once if it ends.
 *
 * Every route that binds to a session goes through here, and this is the only place the recovery
 * exists. `operation` receives the session to use and is called at most twice: once under the pinned
 * session, and once more under a freshly bootstrapped one when the first attempt failed in a way that
 * ends the session (see {@link canReplaceAtlasSession}). Anything derived from the session belongs
 * inside `operation` — the second call receives the successor, so a value read off the session is
 * re-read against it rather than carried across the replacement.
 *
 * Ordering, and it is the reason the replacement is safe: the clear runs before the new session is
 * requested and it moves the session revision synchronously, so every holder of decoded rows has
 * discarded them before a successor token exists. A fresh view is never adopted beside rows painted
 * under the session it replaced.
 *
 * A caller whose pinned session is no longer the cached one is superseded and touches nothing — its
 * failure travels instead. A refusal at the second attempt travels too: a bootstrap presenting no
 * token cannot be refused for authority, so there is no third state to recover into.
 *
 * Deliberately not here: retries, backoff, abort handling and every route's own semantics. Those are
 * the transport's, per request; this decides one thing, which is whether the session a request bound
 * to is still the session to bind to.
 */
export const withAtlasSession = async <T>(
  baseUrl: string,
  operation: (session: SaltileSession) => Promise<T>,
): Promise<T> => {
  // The promise, not just the session it resolves: it names the population this call belongs to.
  const pinned = getSaltileSession(baseUrl);
  try {
    return await operation(await pinned);
  } catch (error) {
    if (!canReplaceAtlasSession(error, baseUrl, pinned)) {
      throw error;
    }
    clearAtlasSessionCache(baseUrl);
    return await operation(await getSaltileSession(baseUrl));
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
 * Why the whole session, and why the token. The session is not actor-scoped — one generation serves
 * every actor — but the tiles decoded under it are: each row a tile yields is a row the *previous*
 * principal was allowed to see, and a principal change is an attribution boundary exactly like a
 * re-pin. The token is worse than useless to the new principal: it seals the actor hash-api resolved
 * for the old one, so every data route refuses it. Clearing here also keeps the revision guard
 * honest — {@link clearAtlasSessionCache} moves the revision only when it really dropped a session,
 * which is sufficient because nothing can be painted without one: a tile fetch needs a resolved
 * session, and dropping the session is what discards the tiles.
 *
 * Why the transport's own recovery is not a substitute, and it is what makes this reset required
 * rather than tidy. Liveness heals itself: the retained token names the old principal's actor, so the
 * new principal's first data request is refused, its renewal presents the same token and is refused
 * too, and the session's owner then drops the session and bootstraps a fresh one (see
 * {@link canReplaceAtlasSession}) — the graph loads either way. What cannot heal is the interval
 * before that: recovery is driven by a refusal, so it begins at the first response, while the rows
 * resolved for the previous principal are resident and compositable from the moment the new one is
 * published, and a request can be issued in between. Attribution has to be right before the first
 * render, which is earlier than any refusal can arrive.
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
    body,
    signal,
    retries,
    priority,
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
  const nodes: TileNode[] = Array.from({ length: delivered });
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

  return withAtlasSession(baseUrl, (session) =>
    fetchAndDecodeTile(
      session,
      coordinate,
      baseUrl,
      signal,
      retry,
      priority,
      includeDetailedData,
      coloredTypeIds,
    ),
  );
};
