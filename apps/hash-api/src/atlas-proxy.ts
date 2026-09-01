import { createProxyMiddleware, fixRequestBody } from "http-proxy-middleware";

import { getRequiredEnv } from "@local/hash-backend-utils/environment";

import type { Logger } from "@local/hash-backend-utils/logger";
import type { Express, Request, Response } from "express";

/**
 * The header carrying the atlas's per-caller authority token.
 *
 * The generation manifest mints one and returns it here; the four data routes require it back in
 * the same header. The frontend is a different origin from this API, so a cross-origin response
 * exposes only the CORS-safelisted headers to script unless this one is named in
 * `Access-Control-Expose-Headers` - see {@link setupAtlasProxy}.
 */
export const ATLAS_AUTHORITY_HEADER = "Atlas-Authority";

/**
 * The path this API mounts the atlas surface at.
 */
export const ATLAS_MOUNT_PATH = "/atlas";

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
 * Mounts the atlas REST surface at `/atlas` on `app`.
 *
 * The proxy states no identity of its own. The caller's Kratos session credential - the
 * `X-Session-Token` header, or the `ory_kratos_session` cookie - crosses the hop with the rest of
 * the request's headers, and the atlas verifies it and resolves the actor itself, exactly as it
 * does for a direct caller. The manifest and the data routes require an authenticated actor, so a
 * request without a valid session answers the atlas's own 401.
 *
 * Mount it above any body parser, so the stream reaches the proxy unread. A parsed body reaches
 * the upstream only by being re-serialised from `req.body`, and re-serialising changes JSON text:
 * whitespace goes, `1.0` becomes `1`, `\u0041` becomes `A`, a duplicate key is dropped, and
 * integer-like keys come back in ascending order. The atlas digests the body it is handed - the
 * generation manifest seals the digest of the filter document into the authority token, and the
 * client retains and re-presents the exact bytes it sent - so a hop that re-serialises answers a
 * different document than the caller stated, and the caller's own re-presentation of the same
 * bytes then digests differently. Mounted above the parser, `req.body` is never set, so
 * `fixRequestBody` writes nothing and the unread stream is piped through as it arrived.
 *
 * Payloads therefore cross the hop byte for byte; the mount's one addition is to the CORS envelope -
 * `Atlas-Authority` is exposed so the caller's own script can read the token it was just handed.
 * The saltile media types, the `Cache-Control: private, no-store` posture, and RFC 9457
 * `application/problem+json` bodies all arrive verbatim. Request caps are the atlas's own and its
 * generation manifest publishes them. Rate limiting belongs to whatever fronts this API; the route
 * applies none.
 *
 * Without the expose line the token never reaches the caller's script, and nothing reports it: the frontend reaches this
 * mount cross-origin (`apiOrigin` is a different origin from `frontendUrl` by default and by
 * deployment shape), and `CORS_CONFIG` states no `exposedHeaders`, so the `cors` package emits no
 * `Access-Control-Expose-Headers` at all. A client implementing the token round trip exactly to
 * contract would then read `null` for the minted token, send nothing back, and take a uniform `401`
 * on every data route - a refusal that looks like authority working correctly. Stating it here
 * rather than on `CORS_CONFIG` keeps the list where the header is known, and leaves the envelope of
 * every other route on this API alone.
 */
export const setupAtlasProxy = (app: Express, logger: Logger) => {
  const target = atlasTarget();

  app.use(
    ATLAS_MOUNT_PATH,
    // Stated before the hop rather than in `proxyRes`: the value does not depend on the upstream
    // response, and a header set here survives the proxy's own header copying.
    (_req, res, next) => {
      res.setHeader("Access-Control-Expose-Headers", ATLAS_AUTHORITY_HEADER);
      next();
    },
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
         * `fixRequestBody` is the fallback for a body that was parsed anyway: it returns without
         * writing when `req.body` is unset, which is the state this mount is composed to be in,
         * and re-streams a parsed body rather than hanging the request if some other middleware
         * ever consumes the stream. It cannot restore the original bytes, so its running is a
         * degradation to notice, not the design.
         */
        proxyReq: fixRequestBody,
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

  logger.info(`Atlas proxy: ${ATLAS_MOUNT_PATH} -> ${target}/v1/atlas`);
};
