import { getSecretEntitiesForIntegration } from "@local/hash-backend-utils/user-secret";
import type {
  UserSecretService,
  VaultClient,
} from "@local/hash-backend-utils/vault";
import { createUserSecretPath } from "@local/hash-backend-utils/vault";
import type { GraphApi } from "@local/hash-graph-client";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { UserSecretProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import type {
  AccountId,
  EntityId,
  EntityRelationAndSubject,
  OwnedById,
} from "@local/hash-subgraph";
import type { Auth } from "googleapis";

import { archiveEntity, createEntity } from "../primitive/entity";
import { createLinkEntity } from "../primitive/link-entity";

type CreateUserSecretParams<T extends object> = {
  /**
   * Whether to archive all existing secrets linked from the sourceIntegrationEntityId.
   */
  archiveExistingSecrets: boolean;
  expiresAt: string; // ISO String
  graphApi: GraphApi;
  /**
   * The bot that will manage the secret, e.g. update, archive, upgrade it.
   * This is the only account that will have edit permissions for the secret.
   */
  managingBotAccountId: AccountId;
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
  userAccountId: AccountId;
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

  const secretMetadata: UserSecretProperties = {
    "https://hash.ai/@hash/types/property-type/connection-source-name/":
      service,
    "https://hash.ai/@hash/types/property-type/expired-at/": expiresAt,
    "https://hash.ai/@hash/types/property-type/vault-path/": vaultPath,
  };

  /**
   * The managing integration bot has edit access to allow it to edit and archive the user secret entity.
   * The user themselves can read the secret.
   * No other account requires access to it.
   */
  const botEditorUserViewerOnly: EntityRelationAndSubject[] = [
    {
      relation: "editor",
      subject: {
        kind: "account",
        subjectId: managingBotAccountId,
      },
    },
    {
      relation: "viewer",
      subject: {
        kind: "account",
        subjectId: userAccountId,
      },
    },
  ];

  /**
   * We currently don't bother to delete existing secrets at the path because when writing new secrets
   * we are using the same path in any case.
   * @todo consider deleting secret at existing path anyway
   */
  await vaultClient.write<Auth.Credentials>({
    data: secretData,
    secretMountPath: "secret",
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
      graphApi,
      integrationEntityId: sourceIntegrationEntityId,
    });

    /**
     * We assume the managing bot is the same for all secrets linked from the integration.
     */
    const managingBotAuthentication = { actorId: managingBotAccountId };

    await Promise.all(
      linkAndSecretPairs.flatMap(({ userSecret, usesUserSecretLink }) => [
        archiveEntity({ graphApi }, managingBotAuthentication, {
          entity: userSecret,
        }),
        archiveEntity({ graphApi }, managingBotAuthentication, {
          entity: usesUserSecretLink,
        }),
      ]),
    );
  }

  const userSecretEntity = await createEntity({ graphApi }, authentication, {
    entityTypeId: systemEntityTypes.userSecret.entityTypeId,
    ownedById: userAccountId as OwnedById,
    properties: secretMetadata,
    relationships: botEditorUserViewerOnly,
  });

  /** Link the user secret to the Google Account */
  await createLinkEntity({ graphApi }, authentication, {
    ownedById: userAccountId as OwnedById,
    linkEntityTypeId: systemLinkEntityTypes.usesUserSecret.linkEntityTypeId,
    leftEntityId: sourceIntegrationEntityId,
    rightEntityId: userSecretEntity.metadata.recordId.entityId,
    relationships: botEditorUserViewerOnly,
  });

  return userSecretEntity.metadata.recordId.entityId;
};
