import { createProxyMiddleware, fixRequestBody } from "http-proxy-middleware";

import { getRequiredEnv } from "@local/hash-backend-utils/environment";

import { getActorIdFromRequest } from "./auth/get-actor-id";

import type { Logger } from "@local/hash-backend-utils/logger";
import type { Express, Request, Response } from "express";

/**
 * The header naming the actor the atlas answers under.
 *
 * The atlas reads it as an authenticated statement of identity, so this API states it from its own
 * session resolution on every proxied request.
 */
export const ATLAS_ACTOR_HEADER = "X-Authenticated-User-Actor-Id";

/**
 * Resolves the atlas listener's address from the environment.
 *
 * `hash-graph atlas` owns the defaults for these two variables as its own clap defaults, so this
 * side reads them as required rather than restating them: one owner, and a misconfiguration is loud
 * here instead of silently proxying to an address nobody is listening on. The read happens per
 * call, which places the address in the environment the server starts in.
 *
 * @throws if either variable is unset.
 */
const atlasTarget = () => {
  const host = getRequiredEnv("HASH_GRAPH_ATLAS_HOST");
  const port = Number.parseInt(getRequiredEnv("HASH_GRAPH_ATLAS_PORT"), 10);

  return `http://${host}:${port}`;
};

/**
 * Mounts the atlas REST surface at `/atlas` on `app`, under the actor each session resolves to.
 *
 * Every request reaches the atlas carrying {@link ATLAS_ACTOR_HEADER}, set from
 * `getActorIdFromRequest` and replacing any value the caller sent: the atlas answers under the
 * actor this API resolved, and a session-less request answers under the public user. This is the
 * identity handling every other route here uses, and the header is what the graph client states
 * when this API calls the graph.
 *
 * Mount it past `authMiddleware` and past the body parsers: the header derivation reads `req.user`,
 * and a parsed JSON body is re-streamed from `req.body`.
 *
 * Responses cross the hop unmodified - the saltile media types, the `Cache-Control: private,
 * no-store` posture, and RFC 9457 `application/problem+json` bodies all arrive verbatim. Request
 * caps are the atlas's own and its generation manifest publishes them. Rate limiting belongs to
 * whatever fronts this API; the route applies none.
 */
export const setupAtlasProxy = (app: Express, logger: Logger) => {
  const target = atlasTarget();

  app.use(
    "/atlas",
    createProxyMiddleware<Request, Response>({
      target,
      /**
       * `/atlas/<route>` names the atlas's `/v1/atlas/<route>`: express strips the mount, and the
       * atlas's own version prefix is restored in its place.
       */
      pathRewrite: (path) => `/v1/atlas${path}`,
      logger: {
        /** This API's request logging already covers these requests. */
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
         * States the request's actor and re-streams its parsed body.
         *
         * `setHeader` replaces any value the caller sent, so the actor the atlas reads is the one
         * this API resolved.
         */
        proxyReq: (proxyReq, req, res) => {
          proxyReq.setHeader(ATLAS_ACTOR_HEADER, getActorIdFromRequest(req));
          fixRequestBody(proxyReq, req, res);
        },
        /**
         * Answers an unreachable atlas in RFC 9457 shape.
         *
         * The atlas renders its own failures the same way, so one error vocabulary covers the
         * whole surface.
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

  logger.info(`Atlas proxy: /atlas -> ${target}/v1/atlas`);
};
