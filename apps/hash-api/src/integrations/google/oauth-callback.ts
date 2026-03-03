import type { WebId } from "@blockprotocol/type-system";
import { NotFoundError } from "@local/hash-backend-utils/error";
import {
  createGoogleOAuth2Client,
  getGoogleAccountById,
} from "@local/hash-backend-utils/google";
import { getMachineIdByIdentifier } from "@local/hash-backend-utils/machine-actors";
import type {
  GoogleOAuth2CallbackRequest,
  GoogleOAuth2CallbackResponse,
} from "@local/hash-isomorphic-utils/google-integration";
import { googleEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { Account as GoogleAccount } from "@local/hash-isomorphic-utils/system-types/google/account";
import type { RequestHandler } from "express";
import { google } from "googleapis";

import { createEntity } from "../../graph/knowledge/primitive/entity";
import { createUserSecret } from "../../graph/knowledge/system-types/user-secret";
import { enabledIntegrations } from "../enabled-integrations";

export const googleOAuthCallback: RequestHandler<
  Record<string, never>,
  GoogleOAuth2CallbackResponse,
  GoogleOAuth2CallbackRequest
> = async (req, res) => {
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

  const googleBotAccountId = await getMachineIdByIdentifier(
    req.context,
    authentication,
    { identifier: "google" },
  ).then((maybeMachineId) => {
    if (!maybeMachineId) {
      throw new NotFoundError("Failed to get google bot");
    }
    return maybeMachineId;
  });

  /**
   * Create the Google Account entity if it doesn't exist
   */
  const existingGoogleAccountEntity = await getGoogleAccountById({
    graphApiClient: req.context.graphApi,
    userAccountId: req.user.accountId,
    googleAccountId: googleUser.data.id,
  });

  let newGoogleAccountEntity;
  if (!existingGoogleAccountEntity) {
    const googleAccountProperties: GoogleAccount["propertiesWithMetadata"] = {
      value: {
        "https://hash.ai/@h/types/property-type/email/": {
          value: googleUser.data.email,
          metadata: {
            dataTypeId: "https://hash.ai/@h/types/data-type/email/v/1",
          },
        },
        "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/":
          {
            value: googleUser.data.name ?? googleUser.data.email,
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
          },
        "https://hash.ai/@google/types/property-type/account-id/": {
          value: googleUser.data.id,
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
          },
        },
      },
    };

    newGoogleAccountEntity = await createEntity(req.context, authentication, {
      entityTypeIds: [googleEntityTypes.account.entityTypeId],
      webId: req.user.accountId as WebId,
      properties: googleAccountProperties,
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
    // Set the expiration to 5 years from now (in ISO format)
    expiresAt: new Date(
      Date.now() + 5 * 365 * 24 * 60 * 60 * 1000,
    ).toISOString(), // the secret data includes a refresh token that lasts indefinitely and will be used as needed
    graphApi: req.context.graphApi,
    managingBotAccountId: googleBotAccountId,
    provenance: req.context.provenance,
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
