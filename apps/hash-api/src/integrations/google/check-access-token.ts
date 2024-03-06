import { RequestHandler } from "express";

import { getGoogleAccessTokenForExpressRequest } from "./shared/get-or-check-access-token";

type GetGoogleAccessTokenRequestBody = {
  googleAccountId: string;
};

type GetGoogleAccessTokenResponseBody =
  | { accessToken: true }
  | { error: string };

/**
 * Check if a valid access token is present for the requested Google Account.
 * If the access token itself is required, use the route controlled by getGoogleAccessToken instead.
 */
export const checkGoogleAccessToken: RequestHandler<
  Record<string, never>,
  GetGoogleAccessTokenResponseBody,
  GetGoogleAccessTokenRequestBody
> =
  // @todo upgrade to Express 5, which handles errors from async request handlers automatically
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  async (req, res) => {
    const accessToken = await getGoogleAccessTokenForExpressRequest({
      googleAccountId: req.body.googleAccountId,
      req,
      res,
    });

    if (accessToken) {
      res.json({
        accessToken: true,
      });
      return;
    }

    res.status(500).send({
      error: "Internal error – no access token and no other error returned.",
    });
  };
