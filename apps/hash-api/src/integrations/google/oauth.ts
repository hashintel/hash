import { getMachineActorId } from "@local/hash-backend-utils/machine-actors";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import {
  GoogleAccountProperties,
  UserSecretProperties,
} from "@local/hash-isomorphic-utils/system-types/shared";
import {
  EntityId,
  EntityRelationAndSubject,
  OwnedById,
} from "@local/hash-subgraph";
import { RequestHandler } from "express";
import { Auth, google } from "googleapis";

import {
  archiveEntity,
  createEntity,
} from "../../graph/knowledge/primitive/entity";
import { createLinkEntity } from "../../graph/knowledge/primitive/link-entity";
import { createUserSecretPath } from "../../vault";
import { enabledIntegrations } from "../enabled-integrations";
import { googleOAuth2Client } from "./client";
import { getGoogleAccountById } from "./shared/get-google-account";
import { getSecretsForAccount } from "./shared/get-secrets-for-account";

const oauth2 = google.oauth2({
  auth: googleOAuth2Client,
  version: "v2",
});

export const googleOAuthCallback: RequestHandler<
  Record<string, never>,
  { accessToken: string; googleAccountEntityId: EntityId } | { error: string },
  { code: string }
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

    if (
      !googleUser.data.id ||
      !googleUser.data.email ||
      !googleUser.data.name
    ) {
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
          googleUser.data.name,
        "https://hash.ai/@hash/types/property-type/account-id/":
          googleUser.data.id,
      };

      newGoogleAccountEntity = await createEntity(req.context, authentication, {
        entityTypeId: systemEntityTypes.google.account.entityTypeId,
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

    if (existingGoogleAccountEntity) {
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
       */
      const linkAndSecretPairs = await getSecretsForAccount(
        req.context,
        authentication,
        {
          userAccountId: req.user.accountId,
          googleAccountEntityId: googleAccountEntity.metadata.recordId.entityId,
        },
      );

      await Promise.all(
        linkAndSecretPairs.flatMap(({ userSecret, usesUserSecretLink }) => [
          archiveEntity(req.context, authentication, { entity: userSecret }),
          archiveEntity(req.context, authentication, {
            entity: usesUserSecretLink,
          }),
        ]),
      );
    }

    /** Google Account is now created and existing secrets are archived */

    /**
     * Create the user secret, which only the user, Google bot, and web admins can access
     */
    const userAndBotAndWebAdminsOnly: EntityRelationAndSubject[] = [
      {
        relation: "administrator",
        subject: {
          kind: "account",
          subjectId: req.user.accountId,
        },
      },
      {
        relation: "viewer",
        subject: {
          kind: "account",
          subjectId: googleBotAccountId,
        },
      },
      {
        relation: "setting",
        subject: {
          kind: "setting",
          subjectId: "administratorFromWeb",
        },
      },
    ];

    const vaultPath = createUserSecretPath({
      accountId: req.user.accountId,
      service: "google",
      restOfPath: `account/${googleUser.data.id}`,
    });

    await vaultClient.write<Auth.Credentials>({
      data: tokens,
      secretMountPath: "secret",
      path: vaultPath,
    });

    const secretMetadata: UserSecretProperties = {
      "https://hash.ai/@hash/types/property-type/connection-source-name/":
        "google",
      "https://hash.ai/@hash/types/property-type/expired-at/": "", // we have a refresh token which lasts indefinitely
      "https://hash.ai/@hash/types/property-type/vault-path/": vaultPath,
    };

    const userSecretEntity = await createEntity(req.context, authentication, {
      entityTypeId: systemEntityTypes.userSecret.entityTypeId,
      ownedById: req.user.accountId as OwnedById,
      properties: secretMetadata,
      relationships: userAndBotAndWebAdminsOnly,
    });

    /** Link the user secret to the Google Account */
    await createLinkEntity(req.context, authentication, {
      ownedById: req.user.accountId as OwnedById,
      linkEntityTypeId: systemLinkEntityTypes.usesUserSecret.linkEntityTypeId,
      leftEntityId: googleAccountEntity.metadata.recordId.entityId,
      rightEntityId: userSecretEntity.metadata.recordId.entityId,
      relationships: userAndBotAndWebAdminsOnly,
    });

    /**
     * By this point we have:
     * 1. A Google Account entity for the account associated with the token
     * 2. An access token and refresh token stored in Vault, referenced by a user secret entity
     * 3. A link between the Google Account and the user secret
     *
     * Features may now create integrations with resources accessible by the user account, with the scopes from the
     * token
     */

    res.json({
      accessToken: tokens.access_token,
      googleAccountEntityId: googleAccountEntity.metadata.recordId.entityId,
    });
  };
