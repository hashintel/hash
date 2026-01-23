import type {
  EntityId,
  EntityUuid,
  MachineId,
  ProvidedEntityEditionProvenance,
  UserId,
  WebId,
} from "@blockprotocol/type-system";
import { getSecretEntitiesForIntegration } from "@local/hash-backend-utils/user-secret";
import type {
  UserSecretService,
  VaultClient,
} from "@local/hash-backend-utils/vault";
import { createUserSecretPath } from "@local/hash-backend-utils/vault";
import type { GraphApi } from "@local/hash-graph-client";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { UsesUserSecret } from "@local/hash-isomorphic-utils/system-types/google/shared";
import type { UserSecret } from "@local/hash-isomorphic-utils/system-types/shared";
import type { Auth } from "googleapis";

import { createEntity } from "../primitive/entity";
import { createLinkEntity } from "../primitive/link-entity";

type CreateUserSecretParams<T extends object> = {
  /**
   * Whether to archive all existing secrets linked from the sourceIntegrationEntityId.
   */
  archiveExistingSecrets: boolean;
  expiresAt: string; // ISO String
  graphApi: GraphApi;
  provenance: ProvidedEntityEditionProvenance;
  /**
   * The bot that will manage the secret, e.g. update, archive, upgrade it.
   * This is the only account that will have edit permissions for the secret.
   */
  managingBotAccountId: MachineId;
  secretData: T;
  /**
   * The rest of the path to the secret in the vault, after the standardized system prefixes.
   * Should not include the 'service' – this will be added automatically.
   */
  restOfPath: string;
  /**
   * The entity to link the secret to via a usesUserSecret link, e.g. an external integration or account.
   */
  sourceIntegrationEntityId: EntityId;
  /**
   * The service / external system this secret is for.
   */
  service: UserSecretService;
  /**
   * The user that owns the secret. The user will have read access to the secret.
   */
  userAccountId: UserId;
  vaultClient: VaultClient;
};

/**
 * Stores a user secret in Vault, creates the secret entity, and links to it from the specified integration entity.
 * Note that:
 * - the ONLY _editor_ of both the secret and the link is the provided managingBotAccountId.
 * - the ONLY _viewer_ of the secret and the link is the userAccountId (apart from the managingBotAccountId).
 */
export const createUserSecret = async <
  T extends object = Record<"value", string>,
>(
  params: CreateUserSecretParams<T>,
): Promise<EntityId> => {
  const {
    archiveExistingSecrets,
    expiresAt,
    graphApi,
    managingBotAccountId,
    provenance,
    userAccountId,
    restOfPath,
    secretData,
    service,
    sourceIntegrationEntityId,
    vaultClient,
  } = params;

  const vaultPath = createUserSecretPath({
    accountId: userAccountId,
    service,
    restOfPath,
  });

  const secretMetadata: UserSecret["propertiesWithMetadata"] = {
    value: {
      "https://hash.ai/@h/types/property-type/connection-source-name/": {
        value: service,
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
        },
      },
      "https://hash.ai/@h/types/property-type/expired-at/": {
        value: expiresAt,
        metadata: {
          dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
        },
      },
      "https://hash.ai/@h/types/property-type/vault-path/": {
        value: vaultPath,
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
        },
      },
    },
  };

  /**
   * We currently don't bother to delete existing secrets at the path because when writing new secrets
   * we are using the same path in any case.
   * @todo consider deleting secret at existing path anyway
   */
  await vaultClient.write<Auth.Credentials>({
    data: secretData,
    path: vaultPath,
  });

  /**
   * We use the authentication of the user to create entities,
   * as the managing bot may not have general write access to the user's web,
   * e.g. if the integration does not involve updating entities in their web.
   */
  const authentication = { actorId: userAccountId };

  if (archiveExistingSecrets) {
    const linkAndSecretPairs = await getSecretEntitiesForIntegration({
      authentication,
      graphApiClient: graphApi,
      integrationEntityId: sourceIntegrationEntityId,
    });

    /**
     * We assume the managing bot is the same for all secrets linked from the integration.
     */
    const managingBotAuthentication = { actorId: managingBotAccountId };

    await Promise.all(
      linkAndSecretPairs.flatMap(({ userSecret, usesUserSecretLink }) => [
        userSecret.archive(graphApi, managingBotAuthentication, provenance),
        usesUserSecretLink.archive(
          graphApi,
          managingBotAuthentication,
          provenance,
        ),
      ]),
    );
  }

  const userSecretEntityUuid = generateUuid() as EntityUuid;
  const usesUserSecretEntityUuid = generateUuid() as EntityUuid;

  const userSecretEntity = await createEntity<UserSecret>(
    { graphApi, provenance },
    authentication,
    {
      entityTypeIds: [systemEntityTypes.userSecret.entityTypeId],
      webId: userAccountId as WebId,
      entityUuid: userSecretEntityUuid,
      properties: secretMetadata,
      policies: [
        {
          name: `user-secret-entity-${userSecretEntityUuid}`,
          principal: {
            type: "actor",
            actorType: "machine",
            id: managingBotAccountId,
          },
          effect: "permit",
          actions: ["viewEntity", "updateEntity", "archiveEntity"],
        },
      ],
    },
  );

  /** Link the user secret to the Google Account */
  await createLinkEntity<UsesUserSecret>(
    { graphApi, provenance },
    authentication,
    {
      webId: userAccountId as WebId,
      entityUuid: usesUserSecretEntityUuid,
      properties: { value: {} },
      linkData: {
        leftEntityId: sourceIntegrationEntityId,
        rightEntityId: userSecretEntity.metadata.recordId.entityId,
      },
      entityTypeIds: [systemLinkEntityTypes.usesUserSecret.linkEntityTypeId],
      policies: [
        {
          name: `user-secret-entity-${usesUserSecretEntityUuid}`,
          principal: {
            type: "actor",
            actorType: "machine",
            id: managingBotAccountId,
          },
          effect: "permit",
          actions: ["viewEntity", "updateEntity", "archiveEntity"],
        },
      ],
    },
  );

  return userSecretEntity.metadata.recordId.entityId;
};
