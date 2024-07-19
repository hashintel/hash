import type { Express } from "express";
import proxy from "express-http-proxy";
import { blockProtocolHubOrigin } from "@local/hash-isomorphic-utils/blocks";

/**
 * Set up a proxy to the blockprotocol.org proxy for the internal API,
 * attaching the HASH BLOCK_PROTOCOL_API key.
 *
 * @param app - The express app.
 */
export const setupBlockProtocolExternalServiceMethodProxy = (app: Express) => {
  app.use(
    "/api/external-service-method",
    proxy(blockProtocolHubOrigin, {
      proxyReqPathResolver: () => "/api/external-service-method",
      proxyReqOptDecorator: (proxyRequestOptions) => {
        const apiKey = process.env.BLOCK_PROTOCOL_API_KEY;

        if (apiKey) {
          // eslint-disable-next-line no-param-reassign
          proxyRequestOptions.headers = {
            ...proxyRequestOptions.headers,
            "x-api-key": apiKey,
          };
        }

        return proxyRequestOptions;
      },
    }),
  );
};
