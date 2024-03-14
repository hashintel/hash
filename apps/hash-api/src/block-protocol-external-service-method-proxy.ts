import { blockProtocolHubOrigin } from "@local/hash-isomorphic-utils/blocks";
import type { Express } from "express";
import proxy from "express-http-proxy";

/**
 * Set up a proxy to the blockprotocol.org proxy for the internal API,
 * attaching the HASH BLOCK_PROTOCOL_API key.
 *
 * @param app - the express app
 */
export const setupBlockProtocolExternalServiceMethodProxy = (app: Express) => {
  app.use(
    "/api/external-service-method",
    proxy(blockProtocolHubOrigin, {
      proxyReqPathResolver: () => "/api/external-service-method",
      proxyReqOptDecorator: (proxyReqOpts) => {
        const apiKey = process.env.BLOCK_PROTOCOL_API_KEY;

        if (apiKey) {
          // eslint-disable-next-line no-param-reassign
          proxyReqOpts.headers = {
            ...proxyReqOpts.headers,
            "x-api-key": apiKey,
          };
        }

        return proxyReqOpts;
      },
    }),
  );
};
