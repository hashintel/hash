import { createGoogleOAuth2Client } from "@local/hash-backend-utils/google";
import { getMachineActorId } from "@local/hash-backend-utils/machine-actors";
import type {
  GoogleOAuth2CallbackRequest,
  GoogleOAuth2CallbackResponse,
} from "@local/hash-isomorphic-utils/google-integration";
import { googleEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { AccountProperties as GoogleAccountProperties } from "@local/hash-isomorphic-utils/system-types/googlesheetsintegration";
import type { OwnedById } from "@local/hash-subgraph";
import type { RequestHandler } from "express";
import { google } from "googleapis";

import { createEntity } from "../../graph/knowledge/primitive/entity";
import { createUserSecret } from "../../graph/knowledge/system-types/user-secret";
import { enabledIntegrations } from "../enabled-integrations";
import { getGoogleAccountById } from "./shared/get-google-account";

export const googleOAuthCallback: RequestHandler<
  Record<string, never>,
  GoogleOAuth2CallbackResponse,
  GoogleOAuth2CallbackRequest
> =
  // @todo upgrade to Express 5, which handles errors from async request handlers automatically
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  async (req, res) => {
    if (!req.user) {
      res.status(401).send({ error: "User not authenticated." });
      return;
    }

    const { vaultClient } = req.context;

    if (!vaultClient) {
      res.status(501).send({ error: "Vault integration is not configured." });
      return;
    }

    if (!enabledIntegrations.googleSheets) {
      res.status(501).send({ error: "Google integration is not enabled." });
      return;
    }

    const { code } = req.body;

    const googleOAuth2Client = createGoogleOAuth2Client();

    const oauth2 = google.oauth2({
      auth: googleOAuth2Client,
      version: "v2",
    });

    const { tokens } = await googleOAuth2Client.getToken({
      code,
    });

    if (!tokens.refresh_token || !tokens.access_token) {
      res.status(500).send({
        error: "Could not exchange code for access and refresh tokens",
      });
      return;
    }

    googleOAuth2Client.setCredentials(tokens);

    const googleUser = await oauth2.userinfo.get();

    if (!googleUser.data.id || !googleUser.data.email) {
      res.status(500).send({
        error: "Google user data is missing required fields",
      });
      return;
    }

    const authentication = { actorId: req.user.accountId };

    const googleBotAccountId = await getMachineActorId(
      req.context,
      authentication,
      { identifier: "google" },
    );

    /**
     * Create the Google Account entity if it doesn't exist
     */
    const existingGoogleAccountEntity = await getGoogleAccountById(
      req.context,
      authentication,
      {
        userAccountId: req.user.accountId,
        googleAccountId: googleUser.data.id,
      },
    );

    let newGoogleAccountEntity;
    if (!existingGoogleAccountEntity) {
      const googleAccountProperties: GoogleAccountProperties = {
        "https://hash.ai/@hash/types/property-type/email/":
          googleUser.data.email,
        "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/":
          googleUser.data.name ?? googleUser.data.email,
        "https://hash.ai/@google/types/property-type/account-id/":
          googleUser.data.id,
      };

      newGoogleAccountEntity = await createEntity(req.context, authentication, {
        entityTypeId: googleEntityTypes.account.entityTypeId,
        ownedById: req.user.accountId as OwnedById,
        properties: googleAccountProperties,
        relationships: [
          {
            // Only allow the Google bot to edit the Google Account entity
            relation: "administrator",
            subject: {
              kind: "account",
              subjectId: googleBotAccountId,
            },
          },
          {
            // Allow the user to view the Google Account entity
            relation: "setting",
            subject: {
              kind: "setting",
              subjectId: "viewFromWeb",
            },
          },
        ],
      });
    }

    const googleAccountEntity =
      existingGoogleAccountEntity ?? newGoogleAccountEntity;

    if (!googleAccountEntity) {
      res.status(500).send({
        error: "Could not find or create Google Account entity",
      });
      return;
    }

    await createUserSecret({
      /**
       * Archive all existing linked secrets for this Google Account.
       * This assumes that we do not create multiple access tokens for a Google account with different scopes,
       * but instead incrementally add scopes as required and rely on a single token.
       *
       * @see https://developers.google.com/identity/protocols/oauth2/web-server#incrementalAuth
       *  > To implement incremental authorization, you complete the normal flow for requesting an access token
       *  > but make sure that the authorization request includes previously granted scopes.
       *  > This approach allows your app to avoid having to manage multiple access tokens.
       *
       * When looking at their Google Account security settings, users will see all scopes granted for an app combined,
       * rather than being able to inspect and revoke access on a token-by-token basis.
       *
       * If we wish to maintain multiple secrets, the vault path will need to be changed to not overwrite existing secrets.
       */
      archiveExistingSecrets: true,
      expiresAt: "", // the secret data includes an refresh token that lasts indefinitely and will be used as needed
      graphApi: req.context.graphApi,
      managingBotAccountId: googleBotAccountId,
      restOfPath: `account/${googleUser.data.id}`,
      secretData: tokens,
      service: "google",
      sourceIntegrationEntityId: googleAccountEntity.metadata.recordId.entityId,
      userAccountId: req.user.accountId,
      vaultClient,
    });

    /**
     * By this point we have:
     * 1. A Google Account entity for the account associated with the token
     * 2. An access token and refresh token stored in Vault, referenced by a user secret entity
     * 3. A link between the Google Account and the user secret
     *
     * Features may now create integrations with resources accessible by the user account, with the scopes from the
     * token.
     */

    res.json({
      googleAccountEntityId: googleAccountEntity.metadata.recordId.entityId,
    });
  };
