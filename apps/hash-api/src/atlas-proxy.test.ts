import { createServer } from "node:http";

import bodyParser from "body-parser";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { publicUserAccountId } from "@local/hash-backend-utils/public-user-account-id";

import { ATLAS_ACTOR_HEADER, setupAtlasProxy } from "./atlas-proxy";

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
 * Mounts the proxy in `index.ts`'s composition: session resolution first, then the body parsers,
 * then the route.
 *
 * The order is the point of the fixture - the proxy sits past the parsers, so a JSON body reaches
 * the atlas only if the route re-streams what the parser consumed.
 */
const startApi = async (session: User | undefined) => {
  const app = express();
  app.use(resolving(session));
  app.use(bodyParser.json());
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
          body,
          path: req.url,
        });
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
  it("survives the body parser and reaches the atlas", async () => {
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
});

describe("the mount path", () => {
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
