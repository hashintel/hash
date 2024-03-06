import { RequestHandler } from "express";

import { enabledIntegrations } from "../enabled-integrations";
import { googleOAuth2Client } from "./oauth-client";
import { getGoogleAccountById } from "./shared/get-google-account";
import { getTokensForAccount } from "./shared/get-tokens-for-account";

type GetGoogleAccessTokenRequestBody = {
  googleAccountId: string;
};

type GetGoogleAccessTokenResponseBody =
  | { accessToken: true }
  | { error: string };

/**
 * Check if a valid access token is present for the requested Google Account
 * @param req
 * @param res
 */
export const checkGoogleAccessToken: RequestHandler<
  Record<string, never>,
  GetGoogleAccessTokenResponseBody,
  GetGoogleAccessTokenRequestBody
> =
  // @todo upgrade to Express 5, which handles errors from async request handlers automatically
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  async (req, res) => {
    if (!req.user) {
      res.status(401).send({ error: "User not authenticated." });
      return;
    }

    if (!req.context.vaultClient) {
      res.status(501).send({ error: "Vault integration is not configured." });
      return;
    }

    if (!enabledIntegrations.googleSheets) {
      res.status(501).send({ error: "Google integration is not enabled." });
      return;
    }

    const authentication = { actorId: req.user.accountId };

    const { googleAccountId } = req.body;

    /**
     * Get the Google Account and ensure it has an available token
     */
    const googleAccount = await getGoogleAccountById(
      req.context,
      authentication,
      {
        userAccountId: req.user.accountId,
        googleAccountId,
      },
    );

    if (!googleAccount) {
      res.status(404).send({
        error: `Google account with id ${googleAccountId} not found.`,
      });
      return;
    }

    const tokens = await getTokensForAccount(req.context, authentication, {
      userAccountId: req.user.accountId,
      googleAccountEntityId: googleAccount.metadata.recordId.entityId,
      vaultClient: req.context.vaultClient,
    });

    const errorMessage = `Could not get tokens for Google account with id ${googleAccountId} for user ${req.user.accountId}.`;

    if (!tokens) {
      res.status(404).send({
        error: errorMessage,
      });
      return;
    }

    googleOAuth2Client.setCredentials(tokens);

    const response = await googleOAuth2Client.getAccessToken();

    if (!response.token) {
      res.status(403).send({
        error: errorMessage,
      });
      return;
    }

    res.json({
      accessToken: true,
    });
  };
