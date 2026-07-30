import { createServer } from "node:http";

import bodyParser from "body-parser";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { publicUserAccountId } from "@local/hash-backend-utils/public-user-account-id";

import {
  ATLAS_ACTOR_HEADER,
  ATLAS_AUTHORITY_HEADER,
  isAtlasPath,
  setupAtlasProxy,
} from "./atlas-proxy";

import type { User } from "./graph/knowledge/system-types/user";
import type { Logger } from "@local/hash-backend-utils/logger";
import type { RequestHandler } from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * The actor a session resolves to in the tests that have one.
 *
 * Any uuid distinct from the public user works; the value only has to be recognisable in the header
 * the upstream receives.
 */
const SESSION_ACTOR = "11111111-1111-4111-8111-111111111111";

/** An actor a caller would like the atlas to answer under. */
const SPOOFED_ACTOR = "22222222-2222-4222-8222-222222222222";

/**
 * A stand-in authority token.
 *
 * An obviously arbitrary opaque string, deliberately not the atlas's width.
 *
 * Opaque on both sides of the hop - this suite asserts the bytes survive, never that they parse, and
 * the proxy under test copies a header it cannot read. A fixture imitating the real width would only
 * teach a number that goes stale; the contract is retain and present, unchanged.
 */
const MINTED_TOKEN = "minted-opaque-authority-token";

/**
 * A filter document written in four ways a re-serialisation does not preserve.
 *
 * Shaped like the document the generation manifest takes as its request body, and deliberately
 * noncanonical: the indentation and the space before `:` are dropped by `JSON.stringify`, `1.0`
 * comes back as `1`, `\u0041` comes back as `A`, and the integer-like keys `"10"` and `"2"` come
 * back in ascending numeric order rather than the order they were written in. The document's meaning
 * is beside the point - the proxy cannot read it either way - so what the assertion needs is text
 * whose parse is lossy in every direction the hop could round-trip it.
 *
 * The manifest seals this document's digest into the authority token, and the client's own filter
 * state is the bytes it sent. So a hop that delivers a different spelling of the same value answers
 * a document the caller never sent, and the caller re-presenting its own bytes then digests
 * differently from the token it holds.
 */
const NONCANONICAL_FILTER = `{
  "all" : [
    { "equal": [ { "path": ["type", "versionedUrl"] }, { "parameter": "\\u0041pple" } ] },
    { "greater": [ { "path": ["depth"] }, { "parameter": 1.0 } ] }
  ],
  "weights": { "10": 1.0, "2": 3 }
}`;

const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
} as unknown as Logger;

/**
 * A session carrying only what this path reads.
 *
 * `getActorIdFromRequest` reads `accountId` and nothing else, so the stub states that field alone
 * rather than assembling a whole graph user.
 */
const sessionUser = { accountId: SESSION_ACTOR } as unknown as User;

/** What the upstream received per request, in request order. */
const received: {
  actor: string | string[] | undefined;
  authority: string | string[] | undefined;
  body: string;
  path: string | undefined;
}[] = [];

const listen = (server: Server) =>
  new Promise<Server>((resolve) => {
    server.listen(0, () => {
      resolve(server);
    });
  });

const close = (server: Server) =>
  new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });

const portOf = (server: Server) => (server.address() as AddressInfo).port;

/**
 * A session resolver standing in for `createAuthMiddleware`.
 *
 * It populates `req.user` on a session and leaves it unset otherwise, which is the state the real
 * middleware leaves behind in each case.
 */
const resolving =
  (session: User | undefined): RequestHandler =>
  (req, _res, next) => {
    if (session) {
      req.user = session;
    }
    next();
  };

/**
 * Mounts the proxy in `index.ts`'s composition: session resolution first, then the JSON parser that
 * skips the atlas prefix, then the route.
 *
 * The composition is the point of the fixture. The proxy sits past the parser, so it can only be a
 * body's second reader, and the skip is what leaves the stream unread for it - which is why the
 * skip decision is imported from the module under test rather than restated here. A copy of the
 * predicate would keep passing while production drifted.
 *
 * `parseAtlasBodies` composes the app the way it was before the skip existed, so a test can hold
 * the parser responsible instead of describing it.
 */
const startApi = async (
  session: User | undefined,
  { parseAtlasBodies = false }: { parseAtlasBodies?: boolean } = {},
) => {
  const app = express();
  const jsonParser = bodyParser.json();
  app.use(resolving(session));
  app.use((req, res, next) =>
    !parseAtlasBodies && isAtlasPath(req.path)
      ? next()
      : jsonParser(req, res, next),
  );
  setupAtlasProxy(app, silentLogger);

  const server = await listen(createServer(app));

  return { server, url: `http://127.0.0.1:${portOf(server)}` };
};

/** A stub upstream: this suite is about what crosses the hop. */
let upstream: Server;

beforeAll(async () => {
  upstream = await listen(
    createServer((req, res) => {
      let body = "";
      req.on("data", (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on("end", () => {
        received.push({
          actor: req.headers[ATLAS_ACTOR_HEADER.toLowerCase()],
          authority: req.headers[ATLAS_AUTHORITY_HEADER.toLowerCase()],
          body,
          path: req.url,
        });
        // The manifest route is the only one that mints, so the stub answers it the way the atlas
        // does - token header plus the no-store posture the per-caller token forces. Answering it
        // here rather than from a second server on a swapped port keeps this suite free of shared
        // mutable state: an assertion that throws mid-test cannot then strand the port for the
        // tests after it.
        if (req.url?.includes("/manifest")) {
          res
            .writeHead(200, {
              [ATLAS_AUTHORITY_HEADER]: MINTED_TOKEN,
              "cache-control": "private, no-store",
            })
            .end();
          return;
        }
        res.writeHead(204).end();
      });
    }),
  );

  process.env.HASH_GRAPH_ATLAS_HOST = "127.0.0.1";
  process.env.HASH_GRAPH_ATLAS_PORT = String(portOf(upstream));
});

afterAll(async () => {
  await close(upstream);
});

describe("the atlas proxy's actor header", () => {
  it("states the session's actor", async () => {
    const api = await startApi(sessionUser);
    received.length = 0;

    const response = await fetch(`${api.url}/atlas/current`);

    expect(response.status).toBe(204);
    expect(received.map(({ actor }) => actor)).toEqual([SESSION_ACTOR]);

    await close(api.server);
  });

  it("overwrites an actor the caller supplied", async () => {
    const api = await startApi(sessionUser);
    received.length = 0;

    const response = await fetch(`${api.url}/atlas/current`, {
      headers: { [ATLAS_ACTOR_HEADER]: SPOOFED_ACTOR },
    });

    expect(response.status).toBe(204);
    expect(received.map(({ actor }) => actor)).toEqual([SESSION_ACTOR]);

    await close(api.server);
  });

  it("states the public user with no session, caller header included", async () => {
    const api = await startApi(undefined);
    received.length = 0;

    const response = await fetch(`${api.url}/atlas/current`, {
      headers: { [ATLAS_ACTOR_HEADER]: SPOOFED_ACTOR },
    });

    expect(response.status).toBe(204);
    expect(received.map(({ actor }) => actor)).toEqual([publicUserAccountId]);

    await close(api.server);
  });
});

describe("a request body", () => {
  it("reaches the atlas", async () => {
    const api = await startApi(sessionUser);
    received.length = 0;

    const tiles = { tiles: [{ z: 3, x: 1, y: 2 }] };
    const response = await fetch(`${api.url}/atlas/edges/g/plain`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(tiles),
    });

    expect(response.status).toBe(204);
    expect(received).toHaveLength(1);
    expect(JSON.parse(received[0]!.body)).toEqual(tiles);
    expect(received[0]!.actor).toBe(SESSION_ACTOR);

    await close(api.server);
  });

  it("arrives byte for byte, however it was spelled", async () => {
    const api = await startApi(sessionUser);
    received.length = 0;

    const response = await fetch(`${api.url}/atlas/generation/g/manifest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: NONCANONICAL_FILTER,
    });

    expect(response.status).toBe(200);
    expect(received).toHaveLength(1);
    expect(received[0]!.body).toBe(NONCANONICAL_FILTER);

    await close(api.server);
  });

  it("loses its spelling once the parser has read it, which is what the skip is for", async () => {
    // The transparency in the test above belongs to the parser skip, not to the proxy: a body the
    // parser consumed can only be re-serialised from `req.body`, and `JSON.stringify` renders one
    // canonical spelling of a value with no memory of the text it came from. Composing the app the
    // pre-skip way states that here, so removing the skip from `index.ts` cannot leave a suite that
    // still claims the bytes cross unmodified.
    const api = await startApi(sessionUser, { parseAtlasBodies: true });
    received.length = 0;

    const response = await fetch(`${api.url}/atlas/generation/g/manifest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: NONCANONICAL_FILTER,
    });

    expect(response.status).toBe(200);
    expect(received).toHaveLength(1);
    expect(received[0]!.body).not.toBe(NONCANONICAL_FILTER);
    expect(received[0]!.body).toBe(
      JSON.stringify(JSON.parse(NONCANONICAL_FILTER)),
    );

    await close(api.server);
  });
});

describe("the authority token's path back to the browser", () => {
  // Without the expose header the whole token round trip no-ops silently: a cross-origin response
  // hands script only the CORS-safelisted headers, so a contract-perfect client reads `null` for
  // the minted token, sends nothing back, and takes a uniform 401 on every data route - a refusal
  // that reads as authority working. `CORS_CONFIG` states no `exposedHeaders`, and the `cors`
  // package emits the header not at all when the option is unset.
  it("exposes the authority header so the caller's own script can read it", async () => {
    const api = await startApi(sessionUser);
    received.length = 0;

    const response = await fetch(`${api.url}/atlas/current`);

    expect(response.headers.get("access-control-expose-headers")).toBe(
      ATLAS_AUTHORITY_HEADER,
    );

    await close(api.server);
  });

  it("carries a minted token back across the hop verbatim, on a bodyless manifest POST", async () => {
    // The expose header is only half of it: the value itself has to survive the hop.
    //
    // The manifest is a `POST` route whose body is optional, and the client's mint and renewal both
    // send none - so this is the exact request shape that crosses the hop. It states no content type
    // either, because a request with no document to describe has no type to state, and stating one
    // would cost the caller a preflight for nothing.
    const api = await startApi(sessionUser);
    received.length = 0;

    const response = await fetch(`${api.url}/atlas/generation/g/manifest`, {
      method: "POST",
    });

    expect(received).toHaveLength(1);
    expect(received[0]!.body).toBe("");
    expect(response.headers.get(ATLAS_AUTHORITY_HEADER)).toBe(MINTED_TOKEN);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("access-control-expose-headers")).toBe(
      ATLAS_AUTHORITY_HEADER,
    );

    await close(api.server);
  });

  it("passes a presented token through to the atlas unchanged", async () => {
    // The reverse direction needs no proxy change - `allowedHeaders` unset makes `cors` reflect the
    // requested headers - but the value must still cross the hop, and `proxyReq` replaces only the
    // actor header.
    const api = await startApi(sessionUser);
    received.length = 0;

    const response = await fetch(`${api.url}/atlas/tile/g/plain/3/5/1`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [ATLAS_AUTHORITY_HEADER]: MINTED_TOKEN,
      },
      body: JSON.stringify({ coloredTypeIds: [] }),
    });

    expect(response.status).toBe(204);
    expect(received).toHaveLength(1);
    expect(received[0]!.authority).toBe(MINTED_TOKEN);

    await close(api.server);
  });
});

describe("the mount path", () => {
  it("claims the mount and its descendants, and stops at the boundary", () => {
    // The parser skip is decided by this predicate for paths the mount never sees, so the boundary is
    // its own claim: a neighbouring route starting with the same letters keeps its parsed body.
    expect(isAtlasPath("/atlas")).toBe(true);
    expect(isAtlasPath("/atlas/generation/g/manifest")).toBe(true);
    expect(isAtlasPath("/atlas-two/tile/g/plain/3/5/1")).toBe(false);
    expect(isAtlasPath("/graphql")).toBe(false);
  });

  it("names the atlas's own version prefix", async () => {
    const api = await startApi(sessionUser);
    received.length = 0;

    const response = await fetch(
      `${api.url}/atlas/tile/g/plain/3/5/1?coloredTypeIds=x`,
    );

    expect(response.status).toBe(204);
    expect(received.map(({ path }) => path)).toEqual([
      "/v1/atlas/tile/g/plain/3/5/1?coloredTypeIds=x",
    ]);

    await close(api.server);
  });
});
