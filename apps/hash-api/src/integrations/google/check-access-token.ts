import type {
  CheckGoogleTokenRequest,
  CheckGoogleTokenResponse,
} from "@local/hash-isomorphic-utils/google-integration";
import type { RequestHandler } from "express";

import { getGoogleAccessTokenForExpressRequest } from "./shared/get-or-check-access-token";

/**
 * Check if a valid access token is present for the requested Google Account.
 * If the access token itself is required, use the route controlled by getGoogleAccessToken instead.
 */
export const checkGoogleAccessToken: RequestHandler<
  Record<string, never>,
  CheckGoogleTokenResponse,
  CheckGoogleTokenRequest
> = async (req, res) => {
  const accessToken = await getGoogleAccessTokenForExpressRequest({
    googleAccountId: req.body.googleAccountId,
    req,
    res,
  });

  if (accessToken) {
    res.json({
      accessToken: true,
    });
  }
};
