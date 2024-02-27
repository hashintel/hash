import { RequestHandler } from "express";
import { Auth, google } from "googleapis";

const googleOAuthClientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
const googleOAuthClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

const oauth2Client = new google.auth.OAuth2(
  googleOAuthClientId,
  googleOAuthClientSecret,
);

export const googleOauthCallback: RequestHandler<
  Record<string, never>,
  { tokens: Auth.Credentials } | { error: string },
  { code: string }
> =
  // @todo upgrade to Express 5, which handles errors from async request handlers automatically
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  async (req, res) => {
    const { code } = req.body;

    if (!req.context.vaultClient) {
      res.status(501).send({ error: "Vault integration is not configured." });
      return;
    }

    if (!googleOAuthClientId || !googleOAuthClientSecret) {
      res.status(501).send({ error: "Google integration is not configured." });
      return;
    }

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    res.json({ tokens });
  };
