import { RequestHandler } from "express";
import { Auth } from "googleapis";

import { enabledIntegrations } from "../enabled-integrations";
import { googleOAuth2Client } from "./oauth-client";
import { getGoogleAccountById } from "./shared/get-google-account";
import { getSecretsForAccount } from "./shared/get-secrets-for-account";

type GetGoogleAccessTokenRequestBody = {
  googleAccountId: string;
};

type GetGoogleAccessTokenResponseBody =
  | { accessToken: string }
  | { error: string };

export const getGoogleAccessToken: RequestHandler<
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

    const secretAndLinkPairs = await getSecretsForAccount(
      req.context,
      authentication,
      {
        userAccountId: req.user.accountId,
        googleAccountEntityId: googleAccount.metadata.recordId.entityId,
      },
    );

    if (!secretAndLinkPairs[0]) {
      res.status(400).send({
        error: `No secrets found for Google account with id ${googleAccountId}.`,
      });
      return;
    }

    const { userSecret } = secretAndLinkPairs[0];

    const vaultPath =
      userSecret.properties[
        "https://hash.ai/@hash/types/property-type/vault-path/"
      ];

    const tokens = await req.context.vaultClient.read<Auth.Credentials>({
      secretMountPath: "secret",
      path: vaultPath,
    });

    googleOAuth2Client.setCredentials(tokens.data);

    const response = await googleOAuth2Client.getAccessToken();

    if (!response.token) {
      res.status(500).send({ error: "Could not get access token." });
      return;
    }

    res.json({
      accessToken: response.token,
    });
  };
