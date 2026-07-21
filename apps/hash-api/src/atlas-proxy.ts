import { createProxyMiddleware } from "http-proxy-middleware";

import type { Logger } from "@local/hash-backend-utils/logger";
import type { Express, Request, Response } from "express";

/**
 * The atlas server address, mirroring the serving side's
 * configuration (`hash-graph atlas` reads the same variables with
 * the same defaults for its own listener).
 */
const atlasHost = process.env.HASH_GRAPH_ATLAS_HOST ?? "127.0.0.1";
const atlasPort = process.env.HASH_GRAPH_ATLAS_PORT ?? "4003";

/**
 * Proxy `/v1/atlas/*` to the atlas server.
 *
 * The deployment shape is frontend → hash-api → atlas: the browser
 * never talks to the atlas listener directly. This proxy is a
 * transparent pass-through — request and response bodies stream
 * through untouched (it MUST be mounted before any body-parsing
 * middleware), and response headers arrive verbatim from the atlas:
 * the saltile media types, the `Cache-Control: private, no-store`
 * caching posture, and RFC 9457 `application/problem+json` error
 * bodies all survive the hop unmodified. Request caps are enforced
 * atlas-side (the generation manifest publishes them); the proxy
 * adds no size limits or rate limits of its own.
 *
 * Viewer identity for the authz era attaches here: once the atlas
 * grows its authorization surface, an `on.proxyReq` handler derives
 * the viewer from hash-api's session auth and forwards it as a
 * request header. Until then the proxy forwards requests exactly as
 * received.
 */
export const setupAtlasProxy = (app: Express, logger: Logger) => {
  const target = `http://${atlasHost}:${atlasPort}`;

  app.use(
    "/v1/atlas",
    createProxyMiddleware<Request, Response>({
      target,
      /**
       * Express strips the mount path from `req.url`; forwarding
       * `req.originalUrl` preserves the full `/v1/atlas/...` path the
       * atlas router expects.
       */
      pathRewrite: (_, req) => req.originalUrl,
      logger: {
        /**
         * Per-request info logs are noise here — hash-api's own
         * request-logging middleware already covers these requests.
         */
        info: () => {},
        warn: (...args: unknown[]) => {
          logger.warn(`[atlas-proxy] ${args.map(String).join(" ")}`);
        },
        error: (...args: unknown[]) => {
          logger.error(`[atlas-proxy] ${args.map(String).join(" ")}`);
        },
      },
      on: {
        /**
         * An unreachable atlas answers in the same RFC 9457 shape the
         * atlas itself uses for errors, so clients see one error
         * vocabulary for the whole surface.
         */
        error: (error, _req, res) => {
          logger.error(`[atlas-proxy] upstream error: ${error.message}`);
          if ("headersSent" in res && !res.headersSent && "status" in res) {
            res
              .status(502)
              .type("application/problem+json")
              .send(
                JSON.stringify({
                  type: "https://hash.ai/problems/atlas-unreachable",
                  title: "Atlas server unreachable",
                  status: 502,
                }),
              );
          }
        },
      },
    }),
  );

  logger.info(`Atlas proxy: /v1/atlas → ${target}`);
};
