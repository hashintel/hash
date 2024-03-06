import { google } from "googleapis";

const googleOAuthClientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
const googleOAuthClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

export const createGoogleOAuth2Client = () =>
  new google.auth.OAuth2(
    googleOAuthClientId,
    googleOAuthClientSecret,
    /**
     * This must be the literal string 'postmessage' because we are using the popup consent flow in the frontend.
     * If we switch to handling the consent flow via our own redirect URL,
     * the redirect URL must be passed here and registered in the Google Cloud Console for the API client.
     */
    "postmessage",
  );
