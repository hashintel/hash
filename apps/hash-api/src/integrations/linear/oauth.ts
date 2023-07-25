import crypto from "node:crypto";

import { LinearClient } from "@linear/sdk";
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
import { isUserMemberOfOrg } from "../../graph/knowledge/system-types/user";
import { SYSTEM_TYPES } from "../../graph/system-types";

const linearClientId = process.env.LINEAR_CLIENT_ID;
const linearClientSecret = process.env.LINEAR_CLIENT_SECRET;

const linearOAuthCallbackUrl =
  process.env.LINEAR_OAUTH_CALLBACK_URL ??
  "http://localhost:5001/oauth/linear/callback";

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

    const { ownedById } = req.query;

    if (!ownedById) {
      res.status(400).send("No ownedById for secret provided.");
      return;
    }

    const userEntityId = req.user.entity.metadata.recordId.entityId;

    if (
      extractEntityUuidFromEntityId(userEntityId) !== ownedById &&
      !(await isUserMemberOfOrg(req.context, {
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
      expires: new Date(Date.now() + 1000 * 60 * 5),
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

    const secretMetadata = {
      [SYSTEM_TYPES.propertyType.expiredAt.metadata.recordId.baseUrl]:
        expiredAt.toISOString(),
      [SYSTEM_TYPES.propertyType.vaultPath.metadata.recordId.baseUrl]:
        vaultPath,
      // @todo create a Linear Workspace entity and create an authorizesDataFrom link to it instead of doing this
      "https://example.com/property-types/linear-org-id/": linearOrgId,
    };

    const secretEntity = await createEntity(req.context, {
      actorId: extractEntityUuidFromEntityId(
        actorEntityId,
      ) as Uuid as AccountId,
      entityTypeId: SYSTEM_TYPES.entityType.userSecret.schema.$id,
      ownedById: ownedById as Uuid as OwnedById,
      properties: secretMetadata,
    });

    res.status(200).send(secretEntity);
  };
