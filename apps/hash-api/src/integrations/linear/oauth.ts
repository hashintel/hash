import crypto from "node:crypto";

import { LinearClient } from "@linear/sdk";
import { getMachineActorId } from "@local/hash-backend-utils/machine-actors";
import {
  apiOrigin,
  frontendUrl,
} from "@local/hash-isomorphic-utils/environment";
import { createDefaultAuthorizationRelationships } from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { LinearIntegrationProperties } from "@local/hash-isomorphic-utils/system-types/linearintegration";
import { UserSecretProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import {
  AccountId,
  Entity,
  EntityId,
  EntityRelationAndSubject,
  EntityUuid,
  extractEntityUuidFromEntityId,
  OwnedById,
  Uuid,
} from "@local/hash-subgraph";
import { RequestHandler } from "express";

import { createEntity } from "../../graph/knowledge/primitive/entity";
import { createLinkEntity } from "../../graph/knowledge/primitive/link-entity";
import {
  getLinearIntegrationByLinearOrgId,
  getLinearIntegrationFromEntity,
  LinearIntegration,
} from "../../graph/knowledge/system-types/linear-integration-entity";
import { isUserMemberOfOrg } from "../../graph/knowledge/system-types/user";
import { createUserSecretPath } from "../../vault";

const linearClientId = process.env.LINEAR_CLIENT_ID;
const linearClientSecret = process.env.LINEAR_CLIENT_SECRET;

const linearOAuthCallbackUrl =
  process.env.LINEAR_OAUTH_CALLBACK_URL ?? `${apiOrigin}/oauth/linear/callback`;

/**
 * @todo oauth state will need to be store somewhere other than memory if we need:
 *   - the authorization process to work if the server is rebooted/redeployed while the user is in the middle of it
 *   - to be running multiple server instances without sticky sessions managed by the load balancer
 *   - to be running multiple processes on the same server instance (e.g. Node Clusters) without ensuring
 *        the same clients are handled by the same process
 */
const stateMap = new Map<
  string,
  {
    actorEntityId: EntityId;
    expires: Date;
    ownedById: EntityUuid;
  }
>();

const generateLinearOAuthUrl = (oAuthState: string) => {
  return (
    "https://linear.app/oauth/authorize?" +
    `client_id=${linearClientId}` +
    `&redirect_uri=${linearOAuthCallbackUrl}` +
    `&state=${oAuthState}` +
    `&response_type=code&scope=write&prompt=consent`
  );
};

export const oAuthLinear: RequestHandler<
  Record<string, never>,
  string,
  {
    ownedById?: EntityUuid;
  }
> =
  // @todo upgrade to Express 5, which handles errors from async request handlers automatically
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  async (req, res) => {
    if (!linearClientId) {
      res
        .status(501)
        .send(
          "Linear integration is not configured – set a client id and secret.",
        );
      return;
    }

    if (!req.user) {
      res.status(401).send("You must be authenticated to do this.");
      return;
    }
    const authentication = { actorId: req.user.accountId };

    const { ownedById } = req.query;

    if (!ownedById) {
      res.status(400).send("No ownedById for secret provided.");
      return;
    }

    const userEntityId = req.user.entity.metadata.recordId.entityId;

    if (
      extractEntityUuidFromEntityId(userEntityId) !== ownedById &&
      !(await isUserMemberOfOrg(req.context, authentication, {
        userEntityId,
        orgEntityUuid: ownedById as EntityUuid,
      }))
    ) {
      res
        .status(403)
        .send(
          "ownedById must represent the user or an organization they are a member of.",
        );
      return;
    }

    const state = crypto.randomBytes(16).toString("hex");

    stateMap.set(state, {
      actorEntityId: req.user.entity.metadata.recordId.entityId,
      expires: new Date(Date.now() + 1000 * 60 * 5), // 5 minutes expiry
      ownedById: ownedById as EntityUuid,
    });

    res.redirect(generateLinearOAuthUrl(state));
  };

export const oAuthLinearCallback: RequestHandler<
  Record<string, never>,
  Entity | { error: string },
  never,
  { code: string; state?: string }
> =
  // @todo upgrade to Express 5, which handles errors from async request handlers automatically
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  async (req, res) => {
    const { code, state } = req.query;

    if (!req.context.vaultClient) {
      res.status(501).send({ error: "Vault integration is not configured." });
      return;
    }

    if (!state) {
      res.status(400).send({ error: "No state provided" });
      return;
    }

    const stateData = stateMap.get(state);

    if (!stateData) {
      res.status(400).send({ error: "Invalid state" });
      return;
    }

    if (
      stateData.actorEntityId !== req.user?.entity.metadata.recordId.entityId
    ) {
      res.status(403).send({ error: "State mismatch" });
      return;
    }

    const now = new Date();
    if (stateData.expires < now) {
      res.status(400).send({ error: "State expired" });
      return;
    }

    const { actorEntityId } = stateData;

    stateMap.delete(state);

    if (!linearClientId || !linearClientSecret) {
      res.status(501).send({ error: "Linear integration is not configured." });
      return;
    }

    const formData = new URLSearchParams();
    formData.append("client_id", linearClientId);
    formData.append("client_secret", linearClientSecret);
    formData.append("code", code);
    formData.append("redirect_uri", linearOAuthCallbackUrl);
    formData.append("grant_type", "authorization_code");

    const response = await fetch("https://api.linear.app/oauth/token", {
      method: "POST",
      body: formData.toString(),
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
    }).then(
      (resp) =>
        resp.json() as Promise<{ access_token: string; expires_in: number }>,
    );

    const { access_token, expires_in } = response;

    // Linear tokens last for 10 years as at 2023/07/25. 10 minute padding to account for time between issuing and this line
    const expiredAt = new Date(Date.now() + expires_in * 1000 - 600_000);

    const linearClient = new LinearClient({
      accessToken: response.access_token,
    });

    const org = await linearClient.organization;

    const linearOrgId = org.id;

    const userAccountId = extractEntityUuidFromEntityId(
      actorEntityId,
    ) as Uuid as AccountId;

    const authentication = { actorId: userAccountId };

    const vaultPath = createUserSecretPath({
      accountId: userAccountId,
      service: "linear",
      restOfPath: `workspace/${linearOrgId}`,
    });

    await req.context.vaultClient.write({
      data: { value: access_token },
      secretMountPath: "secret",
      path: vaultPath,
    });

    const secretMetadata: UserSecretProperties = {
      /** @todo: verify this is the correct value */
      "https://hash.ai/@hash/types/property-type/connection-source-name/":
        "linear",
      "https://hash.ai/@hash/types/property-type/expired-at/":
        expiredAt.toISOString(),
      "https://hash.ai/@hash/types/property-type/vault-path/": vaultPath,
    };

    /**
     * Create the linear integration entity if it doesn't exist, and link it to the user secret
     */
    const existingLinearIntegration = await getLinearIntegrationByLinearOrgId(
      req.context,
      authentication,
      { linearOrgId, userAccountId },
    );

    /**
     * Ensure the linear bot has access to the linear integration entity
     * and user secret.
     */
    const linearBotAccountId = await getMachineActorId(
      req.context,
      authentication,
      { identifier: "linear" },
    );

    const userAndBotAndWebAdminsOnly: EntityRelationAndSubject[] = [
      {
        relation: "administrator",
        subject: {
          kind: "account",
          subjectId: userAccountId,
        },
      },
      {
        relation: "viewer",
        subject: {
          kind: "account",
          subjectId: linearBotAccountId,
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

    let linearIntegration: LinearIntegration;
    if (existingLinearIntegration) {
      linearIntegration = existingLinearIntegration;
    } else {
      // Create the user secret, which only the user, Linear bot, and web admins can access
      const userSecretEntity = await createEntity(req.context, authentication, {
        entityTypeId: systemEntityTypes.userSecret.entityTypeId,
        ownedById: userAccountId as OwnedById,
        properties: secretMetadata,
        relationships: [
          /**
           * Create the user secret, which only the user and Google bot can access.
           * The web bot has edit access to allow it to edit the user secret entity.
           */
          {
            relation: "editor",
            subject: {
              kind: "account",
              subjectId: linearBotAccountId,
            },
          },
          {
            relation: "setting",
            subject: {
              kind: "setting",
              subjectId: "viewFromWeb",
            },
          },
        ],
      });

      const linearIntegrationProperties: LinearIntegrationProperties = {
        "https://hash.ai/@hash/types/property-type/linear-org-id/": linearOrgId,
      };

      // Create the Linear integration entity, which any web member can view and edit
      const linearIntegrationEntity = await createEntity(
        req.context,
        authentication,
        {
          entityTypeId: systemEntityTypes.linearIntegration.entityTypeId,
          ownedById: userAccountId as OwnedById,
          properties: linearIntegrationProperties,
          relationships:
            createDefaultAuthorizationRelationships(authentication),
        },
      );

      // Create the link from the integration to the secret entity, which only the user, Linear bot, and web admins can access
      await createLinkEntity(req.context, authentication, {
        ownedById: userAccountId as OwnedById,
        linkEntityTypeId: systemLinkEntityTypes.usesUserSecret.linkEntityTypeId,
        leftEntityId: linearIntegrationEntity.metadata.recordId.entityId,
        rightEntityId: userSecretEntity.metadata.recordId.entityId,
        properties: {},
        relationships: userAndBotAndWebAdminsOnly,
      });

      linearIntegration = getLinearIntegrationFromEntity({
        entity: linearIntegrationEntity,
      });
    }

    res.redirect(
      `${frontendUrl}/settings/integrations/linear/new?linearIntegrationEntityId=${linearIntegration.entity.metadata.recordId.entityId}`,
    );
  };
