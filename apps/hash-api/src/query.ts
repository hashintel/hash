import { supplyChainQueries } from "./query/queries/supply-chain";
import { resolveInvocation } from "./query/resolve-query";
import { registerQueries } from "./query/shared/query-registry";

import type {
  QueryRequest,
  QueryResponse,
} from "@local/hash-isomorphic-utils/query/types";
import type { Express } from "express";
import type Keyv from "keyv";

/** Upper bound on invocations per batch request, to bound work per call. */
const MAX_BATCH_SIZE = 25;

let queriesRegistered = false;

/**
 * Register the built-in named queries. Idempotent so repeated setup calls (e.g.
 * across test harness reinitialisation) don't throw on duplicate registration.
 */
const ensureQueriesRegistered = () => {
  if (queriesRegistered) {
    return;
  }
  registerQueries(supplyChainQueries);
  queriesRegistered = true;
};

/**
 * Mounts the generic query gateway at `POST /api/query`.
 *
 * The gateway is a thin control plane: it authenticates the caller, authorises
 * each invocation against its scoped web(s), resolves named queries to stored
 * artifacts, and returns short-lived URLs the client fetches directly from
 * storage (the data plane). Artifact bytes never pass through the API.
 */
export const setupQueryHandler = (app: Express, cache: Keyv) => {
  ensureQueriesRegistered();

  app.post("/api/query", async (req, res) => {
    const { user } = req;
    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const body = req.body as QueryRequest | undefined;
    if (!body || !Array.isArray(body.requests)) {
      res
        .status(400)
        .json({
          error: "Request body must be { requests: QueryInvocation[] }",
        });
      return;
    }

    if (body.requests.length > MAX_BATCH_SIZE) {
      res
        .status(400)
        .json({ error: `Too many requests (max ${MAX_BATCH_SIZE})` });
      return;
    }

    const { graphApi, uploadProvider } = req.context;

    const results = await Promise.all(
      body.requests.map((invocation) =>
        resolveInvocation({
          invocation,
          actorId: user.accountId,
          graphApi,
          uploadProvider,
          cache,
        }),
      ),
    );

    res.json({ results } satisfies QueryResponse);
  });
};
