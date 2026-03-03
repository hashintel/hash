import type {
  GetGoogleTokenRequest,
  GetGoogleTokenResponse,
} from "@local/hash-isomorphic-utils/google-integration";
import type { RequestHandler } from "express";

import { getGoogleAccessTokenForExpressRequest } from "./shared/get-or-check-access-token";
/**
 * Get an access token for use in the client where unavoidable, e.g. to use the Google File Picker.
 * Access tokens last for 1 hour.
 */
export const getGoogleAccessToken: RequestHandler<
  Record<string, never>,
  GetGoogleTokenResponse,
  GetGoogleTokenRequest
> = async (req, res) => {
  const accessToken = await getGoogleAccessTokenForExpressRequest({
    googleAccountId: req.body.googleAccountId,
    req,
    res,
  });

  if (accessToken) {
    res.json({
      accessToken,
    });
  }
};
