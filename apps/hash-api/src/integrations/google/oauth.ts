import { RequestHandler } from "express";
import { Auth, google } from "googleapis";

import { createUserSecretPath } from "../../vault";

const googleOAuthClientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
const googleOAuthClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

const oauth2Client = new google.auth.OAuth2(
  googleOAuthClientId,
  googleOAuthClientSecret,
  /**
   * This must be the literal string 'postmessage' because we are using the popup consent flow in the frontend.
   * If we switch to handling the consent flow via our own redirect URL,
   * the redirect URL must be passed here and registered in the Google Cloud Console for the API client.
   */
  "postmessage",
);

const drive = google.drive({
  version: "v3",
  auth: oauth2Client,
});

const oauth2 = google.oauth2({
  auth: oauth2Client,
  version: "v2",
});

export const googleOauthCallback: RequestHandler<
  Record<string, never>,
  { accessToken: string } | { error: string },
  { code: string }
> =
  // @todo upgrade to Express 5, which handles errors from async request handlers automatically
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  async (req, res) => {
    if (!req.user) {
      res.status(401).send({ error: "User not authenticated." });
      return;
    }

    const { code } = req.body;

    if (!req.context.vaultClient) {
      res.status(501).send({ error: "Vault integration is not configured." });
      return;
    }

    if (!googleOAuthClientId || !googleOAuthClientSecret) {
      res.status(501).send({ error: "Google integration is not configured." });
      return;
    }

    console.log({ code });

    const { tokens } = await oauth2Client.getToken({
      code,
    });
    oauth2Client.setCredentials(tokens);

    console.log({ tokens });

    const googleUser = await oauth2.userinfo.get();
    console.log({ googleUser });

    const vaultPath = createUserSecretPath({
      accountId: req.user.accountId,
      service: "google",
      restOfPath: `workspace/${linearOrgId}`,
    });

    res.json({ accessToken: tokens.access_token! });
  };
