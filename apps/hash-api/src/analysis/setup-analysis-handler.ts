import { ipKeyGenerator, rateLimit } from "express-rate-limit";

import { telemetry } from "../telemetry/telemetry";
import { dashboardAnalyses } from "./analyses/dashboards";
import { supplyChainAnalyses } from "./analyses/supply-chain";
import { resolveInvocation } from "./setup-analysis-handler/resolve-analysis";
import { registerAnalyses } from "./shared/analysis-registry";

import type {
  AnalysisRequest,
  AnalysisResponse,
} from "@local/hash-isomorphic-utils/analysis/types";
import type { Express } from "express";
import type Keyv from "keyv";

/** Upper bound on invocations per batch request, to bound work per call. */
const MAX_BATCH_SIZE = 25;

/**
 * Per-IP rate limiter for the analysis gateway. A single request fans out to up
 * to {@link MAX_BATCH_SIZE} invocations, each authorising against its scoped
 * webs and reading from storage, so the endpoint is an amplifier that must be
 * bounded. Authenticated callers get a higher ceiling than anonymous ones.
 */
const analysisRateLimiter = rateLimit({
  windowMs: process.env.NODE_ENV === "test" ? 10 : 1000 * 60, // 1 minute
  limit: (req) => (req.user ? 240 : 30),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.ip ? ipKeyGenerator(req.ip) : "ip-unavailable"),
});

let analysesRegistered = false;

/**
 * Register the built-in named analyses. Idempotent so repeated setup calls (e.g.
 * across test harness reinitialisation) don't throw on duplicate registration.
 */
const ensureAnalysesRegistered = () => {
  if (analysesRegistered) {
    return;
  }
  registerAnalyses(supplyChainAnalyses);
  registerAnalyses(dashboardAnalyses);
  analysesRegistered = true;
};

/**
 * Mounts the generic analysis gateway at `POST /api/analysis`.
 *
 * The gateway is a thin control plane: it authenticates the caller, authorises
 * each invocation against its scoped web(s), resolves named analyses to stored
 * artifacts, and returns short-lived URLs the client fetches directly from
 * storage (the data plane). Artifact bytes never pass through the API.
 */
export const setupAnalysisHandler = (app: Express, cache: Keyv) => {
  ensureAnalysesRegistered();

  app.post("/api/analysis", analysisRateLimiter, async (req, res) => {
    const { user } = req;
    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const body = req.body as AnalysisRequest | undefined;
    if (!body || !Array.isArray(body.requests)) {
      res.status(400).json({
        error: "Request body must be { requests: AnalysisInvocation[] }",
      });
      return;
    }

    if (body.requests.length > MAX_BATCH_SIZE) {
      res
        .status(400)
        .json({ error: `Too many requests (max ${MAX_BATCH_SIZE})` });
      return;
    }

    const { graphApi, temporalClient, uploadProvider } = req.context;

    const results = await Promise.all(
      body.requests.map((invocation) =>
        resolveInvocation({
          invocation,
          actorId: user.accountId,
          graphApi,
          temporalClient,
          uploadProvider,
          cache,
        }),
      ),
    );

    for (const [index, result] of results.entries()) {
      const invocation = body.requests[index]!;
      telemetry.track(req, "analysis_run", {
        analysis: invocation.analysis,
        webId: invocation.webId,
        status: result.status,
        artifactCount: result.artifacts?.length ?? 0,
      });
    }

    res.json({ results } satisfies AnalysisResponse);
  });
};
