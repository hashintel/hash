import {
  createGoogleOAuth2Client,
  getTokensForGoogleAccount,
} from "@local/hash-backend-utils/google";
import type { Request, Response } from "express";

import { enabledIntegrations } from "../../enabled-integrations";
import { getGoogleAccountById } from "./get-google-account";

/**
 * Shared function to retrieve a Google access token for an Express request,
 * providing standard error handling and response handling.
 * Calling controllers decide what to do with the token.
 */
export const getGoogleAccessTokenForExpressRequest = async ({
  googleAccountId,
  req,
  res,
}: {
  googleAccountId: string;
  req: Request;
  res: Response;
}) => {
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

  const tokens = await getTokensForGoogleAccount({
    graphApi: req.context.graphApi,
    googleAccountEntityId: googleAccount.metadata.recordId.entityId,
    userAccountId: req.user.accountId,
    vaultClient: req.context.vaultClient,
  });

  const errorMessage = `Could not get tokens for Google account with id ${googleAccountId} for user ${req.user.accountId}.`;

  if (!tokens) {
    res.status(500).send({
      error: errorMessage,
    });
    return;
  }

  const googleOAuth2Client = createGoogleOAuth2Client();
  googleOAuth2Client.setCredentials(tokens);

  const response = await googleOAuth2Client.getAccessToken();

  if (!response.token) {
    res.status(500).send({
      error: errorMessage,
    });
    return;
  }

  return response.token;
};
