import crypto from "node:crypto";

import { LinearClient } from "@linear/sdk";
import {
  apiOrigin,
  frontendUrl,
} from "@local/hash-isomorphic-utils/environment";
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
    ownerType: "user" | "org";
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
  {},
  {},
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

    const ownerType =
      extractEntityUuidFromEntityId(userEntityId) === ownedById
        ? "user"
        : "org";

    const state = crypto.randomBytes(16).toString("hex");

    stateMap.set(state, {
      actorEntityId: req.user.entity.metadata.recordId.entityId,
      expires: new Date(Date.now() + 1000 * 60 * 5), // 5 minutes expiry
      ownedById: ownedById as EntityUuid,
      ownerType,
    });

    res.redirect(generateLinearOAuthUrl(state));
  };

export const oAuthLinearCallback: RequestHandler<
  {},
  Entity | { error: string },
  {},
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

    const { actorEntityId, ownedById, ownerType } = stateData;

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

    // @todo give the path components some more thought
    const vaultPath = `${ownerType}/${ownedById}/linear/user/${actorEntityId}/workspace/${linearOrgId}`;

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

    const userAccountId = extractEntityUuidFromEntityId(
      actorEntityId,
    ) as Uuid as AccountId;
    const authentication = { actorId: userAccountId };

    const existingLinearIntegration = await getLinearIntegrationByLinearOrgId(
      req.context,
      authentication,
      { linearOrgId, userAccountId },
    );

    let linearIntegration: LinearIntegration;

    if (existingLinearIntegration) {
      linearIntegration = existingLinearIntegration;
    } else {
      const userSecretEntity = await createEntity(req.context, authentication, {
        entityTypeId: systemEntityTypes.userSecret.entityTypeId,
        ownedById: ownedById as Uuid as OwnedById,
        properties: secretMetadata,
      });

      const linearIntegrationProperties: LinearIntegrationProperties = {
        "https://hash.ai/@hash/types/property-type/linear-org-id/": linearOrgId,
      };

      const linearIntegrationEntity = await createEntity(
        req.context,
        authentication,
        {
          entityTypeId: systemEntityTypes.linearIntegration.entityTypeId,
          ownedById: ownedById as Uuid as OwnedById,
          properties: linearIntegrationProperties,
        },
      );

      await createLinkEntity(req.context, authentication, {
        ownedById: ownedById as Uuid as OwnedById,
        linkEntityTypeId: systemLinkEntityTypes.usesUserSecret.linkEntityTypeId,
        leftEntityId: linearIntegrationEntity.metadata.recordId.entityId,
        rightEntityId: userSecretEntity.metadata.recordId.entityId,
        properties: {},
      });

      linearIntegration = getLinearIntegrationFromEntity({
        entity: linearIntegrationEntity,
      });
    }

    res.redirect(
      `${frontendUrl}/settings/integrations/linear/new?linearIntegrationEntityId=${linearIntegration.entity.metadata.recordId.entityId}`,
    );
  };
