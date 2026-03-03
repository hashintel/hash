import { blockProtocolHubOrigin } from "@local/hash-isomorphic-utils/blocks-constants";
import type { Express, Request, Response } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

/**
 * Set up a proxy to the blockprotocol.org proxy for the internal API,
 * attaching the HASH BLOCK_PROTOCOL_API key.
 *
 * @param app - the express app
 */
export const setupBlockProtocolExternalServiceMethodProxy = (app: Express) => {
  app.use(
    "/api/external-service-method",
    createProxyMiddleware<Request, Response>({
      target: blockProtocolHubOrigin,
      on: {
        proxyReq: (proxyReq, _, __) => {
          const apiKey = process.env.BLOCK_PROTOCOL_API_KEY;

          if (apiKey) {
            proxyReq.setHeader("x-api-key", apiKey);
          }
        },
      },
    }),
  );
};
