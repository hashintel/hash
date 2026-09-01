import { createServer } from "node:http";

import bodyParser from "body-parser";
import express from "express";
jimport { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ATLAS_AUTHORITY_HEADER, setupAtlasProxy } from "./atlas-proxy";

import type { Logger } from "@local/hash-backend-utils/logger";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * The header the atlas reads as a delegated actor statement - its own vocabulary, not this
 * module's: the proxy exports no constant for it because it neither states nor strips it. The
 * spelling is pinned upstream as `ACTOR_ID_HEADER` in the authentication middleware.
 */
const ACTOR_ID_HEADER = "X-Authenticated-User-Actor-Id";

/** An actor a caller would like the atlas to answer under. */
const SPOOFED_ACTOR = "22222222-2222-4222-8222-222222222222";

/**
 * A stand-in Kratos session token.
 *
 * Opaque across the hop, like the authority token below: the proxy under test cannot verify it,
 * so the suite asserts the bytes arrive, never that they authenticate.
 */
const SESSION_TOKEN = "stand-in-kratos-session-token";

/**
 * A `Cookie` header carrying the Kratos session cookie among neighbours.
 *
 * The atlas picks `ory_kratos_session` out of the header itself, so what the hop owes it is the
 * header unchanged - neighbouring cookies included.
 */
const SESSION_COOKIE = "other=1; ory_kratos_session=stand-in-session-cookie";

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

/** What the upstream received per request, in request order. */
const received: {
  actor: string | string[] | undefined;
  authority: string | string[] | undefined;
  cookie: string | undefined;
  sessionToken: string | string[] | undefined;
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
 * Mounts the proxy in `index.ts`'s composition: in the proxies section, above the JSON parser, so
 * an atlas request's stream is never read before the hop and the proxy is the body's first and
 * only reader. Session resolution is absent because the proxy reads nothing it produces - the
 * session credential it forwards is a request header.
 *
 * `parserAboveProxy` composes the app the drifted way - a parser mounted before the proxy - so a
 * test can hold the mount order responsible instead of describing it.
 */
const startApi = async ({
  parserAboveProxy = false,
}: { parserAboveProxy?: boolean } = {}) => {
  const app = express();
  const jsonParser = bodyParser.json();
  if (parserAboveProxy) {
    app.use(jsonParser);
  }
  setupAtlasProxy(app, silentLogger);
  app.use(jsonParser);

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
          actor: req.headers[ACTOR_ID_HEADER.toLowerCase()],
          authority: req.headers[ATLAS_AUTHORITY_HEADER.toLowerCase()],
          cookie: req.headers.cookie,
          sessionToken: req.headers["x-session-token"],
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

describe("the caller's identity", () => {
  it("passes the session token through untouched", async () => {
    const api = await startApi();
    received.length = 0;

    const response = await fetch(`${api.url}/atlas/current`, {
      headers: { "X-Session-Token": SESSION_TOKEN },
    });

    expect(response.status).toBe(204);
    expect(received.map(({ sessionToken }) => sessionToken)).toEqual([
      SESSION_TOKEN,
    ]);

    await close(api.server);
  });

  it("passes the session cookie through untouched, neighbours included", async () => {
    const api = await startApi();
    received.length = 0;

    const response = await fetch(`${api.url}/atlas/current`, {
      headers: { cookie: SESSION_COOKIE },
    });

    expect(response.status).toBe(204);
    expect(received.map(({ cookie }) => cookie)).toEqual([SESSION_COOKIE]);

    await close(api.server);
  });

  it("states no actor of its own", async () => {
    // The pin on the deletion: the proxy used to write the actor header from this API's session
    // resolution, and the atlas ignored it every time - a bare actor statement without its paired
    // service secret is refused upstream. A request that arrives without the header must leave
    // without it, so a regression re-adding the injection fails here.
    const api = await startApi();
    received.length = 0;

    const response = await fetch(`${api.url}/atlas/current`);

    expect(response.status).toBe(204);
    expect(received.map(({ actor }) => actor)).toEqual([undefined]);

    await close(api.server);
  });

  it("passes a caller's actor header through, which impersonates nobody", async () => {
    // The proxy neither states nor strips the actor header, so a caller's spelling of it crosses
    // the hop like any other header. The defence is the atlas's own and is pinned there:
    // `bare_actor_id_header_does_not_impersonate` holds that without the paired service secret the
    // header is ignored and the request resolves from its session credential alone.
    const api = await startApi();
    received.length = 0;

    const response = await fetch(`${api.url}/atlas/current`, {
      headers: { [ACTOR_ID_HEADER]: SPOOFED_ACTOR },
    });

    expect(response.status).toBe(204);
    expect(received.map(({ actor }) => actor)).toEqual([SPOOFED_ACTOR]);

    await close(api.server);
  });
});

describe("a request body", () => {
  it("reaches the atlas", async () => {
    const api = await startApi();
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

    await close(api.server);
  });

  it("arrives byte for byte, however it was spelled", async () => {
    const api = await startApi();
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

  it("loses its spelling once a parser above the mount has read it, which is what the order is for", async () => {
    // The transparency in the test above belongs to the mount order, not to the proxy: a body the
    // parser consumed can only be re-serialised from `req.body`, and `JSON.stringify` renders one
    // canonical spelling of a value with no memory of the text it came from. Composing the app the
    // drifted way states that here, so moving the mount below `index.ts`'s parser cannot leave a
    // suite that still claims the bytes cross unmodified.
    const api = await startApi({ parserAboveProxy: true });
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
    const api = await startApi();
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
    const api = await startApi();
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
    // requested headers - and the value must still cross the hop like the identity headers above.
    const api = await startApi();
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
  it("stops at the path boundary", async () => {
    // Express matches a mount at a path-segment boundary, so a neighbouring route starting with
    // the same letters is never proxied - it falls through to the rest of the app.
    const api = await startApi();
    received.length = 0;

    const response = await fetch(`${api.url}/atlas-two/tile/g/plain/3/5/1`);

    expect(response.status).toBe(404);
    expect(received).toHaveLength(0);

    await close(api.server);
  });

  it("names the atlas's own version prefix", async () => {
    const api = await startApi();
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
