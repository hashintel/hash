import { typedEntries } from "@local/advanced-types/typed-entries";
import { NotFoundError } from "@local/hash-backend-utils/error";
import {
  createMachineActorEntity,
  createWebMachineActor,
  getMachineActorId,
  getWebMachineActorId,
} from "@local/hash-backend-utils/machine-actors";
import { frontendUrl } from "@local/hash-isomorphic-utils/environment";
import type { blockProtocolDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { SystemTypeWebShortname } from "@local/hash-isomorphic-utils/ontology-types";
import type {
  AccountGroupId,
  AccountId,
  OwnedById,
} from "@local/hash-subgraph";
import { extractOwnedByIdFromEntityId } from "@local/hash-subgraph";

import { enabledIntegrations } from "../../integrations/enabled-integrations";
import { logger } from "../../logger";
import {
  createAccount,
  createAccountGroup,
  createWeb,
} from "../account-permission-management";
import type { ImpureGraphContext } from "../context-types";
import {
  createHashInstance,
  getHashInstance,
} from "../knowledge/system-types/hash-instance";
import { createOrg, getOrgByShortname } from "../knowledge/system-types/org";
import { systemAccountId } from "../system-account";
import { getEntitiesByType } from "./migrate-ontology-types/util";

// Whether this is a self-hosted instance, rather than the central HASH hosted instance
export const isSelfHostedInstance =
  process.env.SELF_HOSTED_HASH === "true" ||
  !["http://localhost:3000", "https://app.hash.ai", "https://hash.ai"].includes(
    frontendUrl,
  );

const owningWebs: Record<
  SystemTypeWebShortname,
  {
    machineActorAccountId?: AccountId;
    accountGroupId?: AccountGroupId;
    enabled: boolean;
    name: string;
    websiteUrl: string;
  }
> = {
  hash: {
    enabled: true,
    name: "HASH",
    websiteUrl: "https://hash.ai",
  },
  linear: {
    enabled: enabledIntegrations.linear,
    name: "Linear",
    websiteUrl: "https://linear.app",
  },
};

export const getOrCreateOwningAccountGroupId = async (
  context: ImpureGraphContext,
  webShortname: SystemTypeWebShortname,
): Promise<{ accountGroupId: AccountGroupId; machineActorId: AccountId }> => {
  // We only need to resolve this once for each shortname during the seeding process
  const resolvedAccountGroupId = owningWebs[webShortname].accountGroupId;
  const resolvedMachineActorAccountId =
    owningWebs[webShortname].machineActorAccountId;

  // After this function has been run once, these should exist
  if (resolvedAccountGroupId && resolvedMachineActorAccountId) {
    return {
      accountGroupId: resolvedAccountGroupId,
      machineActorId: resolvedMachineActorAccountId,
    };
  }

  try {
    // If this function is used again after the initial seeding, it's possible that we've created the org in the past
    const foundOrg = await getOrgByShortname(
      context,
      { actorId: systemAccountId },
      {
        shortname: webShortname,
      },
    );

    if (foundOrg) {
      const machineActorIdForWeb =
        foundOrg.entity.metadata.provenance.recordCreatedById;

      logger.debug(
        `Found org entity with shortname ${webShortname}, accountGroupId: ${foundOrg.accountGroupId}, machine actor accountId: ${machineActorIdForWeb}`,
      );
      owningWebs[webShortname].accountGroupId = foundOrg.accountGroupId;
      owningWebs[webShortname].machineActorAccountId = machineActorIdForWeb;

      return {
        accountGroupId: foundOrg.accountGroupId,
        machineActorId: machineActorIdForWeb,
      };
    }
  } catch {
    // No org system type yet, this must be the first migration run in which this web was used
  }

  const machineActorIdForWeb =
    webShortname === "hash"
      ? systemAccountId
      : await createAccount(context, { actorId: systemAccountId }, {});

  const authentication = { actorId: machineActorIdForWeb };

  const accountGroupId = await createAccountGroup(
    context,
    { actorId: machineActorIdForWeb },
    {},
  );

  await createWeb(context, authentication, {
    ownedById: accountGroupId as OwnedById,
    owner: { kind: "accountGroup", subjectId: accountGroupId },
  });

  logger.info(
    `Created accountGroup for web with shortname ${webShortname}, accountGroupId: ${accountGroupId}`,
    `Created machine actor for web with shortname ${webShortname}, machineActorId: ${machineActorIdForWeb}`,
  );

  owningWebs[webShortname].accountGroupId = accountGroupId;
  owningWebs[webShortname].machineActorAccountId = machineActorIdForWeb;

  return {
    accountGroupId,
    machineActorId: machineActorIdForWeb,
  };
};

/**
 * Ensures that there are entities associated with each:
 * - system web (create an Organization associated with it)
 * - machine actor that creates the web (create a Machine associated with it)
 *
 * Also creates other required system entities, such as the hashInstance entity and HASH AI Assistant.
 */
export const ensureSystemEntitiesExist = async (params: {
  context: ImpureGraphContext;
}) => {
  if (isSelfHostedInstance) {
    return;
  }

  const { context } = params;

  logger.debug(
    "Ensuring account group organization and machine entities exist",
  );

  for (const [webShortname, { enabled, name, websiteUrl }] of typedEntries(
    owningWebs,
  )) {
    if (!enabled) {
      continue;
    }

    const { accountGroupId, machineActorId: machineActorAccountId } =
      await getOrCreateOwningAccountGroupId(context, webShortname);

    const authentication = { actorId: machineActorAccountId };
    const foundOrg = await getOrgByShortname(context, authentication, {
      shortname: webShortname,
    });

    if (!foundOrg) {
      await createOrg(context, authentication, {
        orgAccountGroupId: accountGroupId,
        shortname: webShortname,
        name,
        websiteUrl,
      });
    }

    /**
     * Create a machine entity associated with each actor that created system types.
     * These machines may also be added to other webs as needed (e.g. for integration workflows).
     */
    try {
      await getMachineActorId(context, authentication, {
        identifier: webShortname,
      });
    } catch (error) {
      let preferredName;
      if (webShortname === "hash") {
        preferredName = "HASH";
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      } else if (webShortname === "linear") {
        preferredName = "Linear Integration";
      } else {
        throw new Error(
          `Unhandled web shortname ${webShortname} requires a display name for the machine actor specified`,
        );
      }

      if (error instanceof NotFoundError) {
        await createMachineActorEntity(context, {
          machineAccountId: machineActorAccountId,
          identifier: webShortname,
          ownedById: accountGroupId as OwnedById,
          displayName: preferredName,
          shouldBeAbleToCreateMoreMachineEntities: false,
          systemAccountId,
        });

        logger.info(
          `Created machine actor entity for '${webShortname}' machine types, using accountId ${machineActorAccountId} in accountGroupId '${accountGroupId}`,
        );
      } else {
        throw error;
      }
    }
  }

  /**
   * Create the HASH Instance entity, which stores configuration settings for the instance
   */
  const authentication = { actorId: systemAccountId };
  try {
    await getHashInstance(context, authentication, {});
  } catch (error) {
    if (error instanceof NotFoundError) {
      await createHashInstance(context, authentication, {});
      logger.info("Created hashInstance entity");
    } else {
      throw error;
    }
  }

  /**
   * Create the HASH AI Machine actor and entity, which is added as needed to webs to run AI-related workflows.
   */
  try {
    await getMachineActorId(context, authentication, {
      identifier: "hash-ai",
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      const aiAssistantAccountId = await createAccount(
        context,
        authentication,
        {},
      );

      const hashAccountGroupId = owningWebs.hash.accountGroupId;
      if (!hashAccountGroupId) {
        throw new Error(
          `Somehow reached the point of creating the HASH AI machine actor without a hash accountGroupId`,
        );
      }

      await context.graphApi.modifyWebAuthorizationRelationships(
        systemAccountId,
        [
          {
            operation: "create",
            resource: hashAccountGroupId,
            relationAndSubject: {
              subject: {
                kind: "account",
                subjectId: aiAssistantAccountId,
              },
              relation: "entityCreator",
            },
          },
          {
            operation: "create",
            resource: hashAccountGroupId,
            relationAndSubject: {
              subject: {
                kind: "account",
                subjectId: aiAssistantAccountId,
              },
              relation: "entityEditor",
            },
          },
        ],
      );

      await createMachineActorEntity(context, {
        identifier: "hash-ai",
        machineAccountId: aiAssistantAccountId,
        ownedById: hashAccountGroupId as OwnedById,
        displayName: "HASH AI",
        shouldBeAbleToCreateMoreMachineEntities: false,
        systemAccountId,
      });

      logger.info("Created HASH AI entity");
    } else {
      throw error;
    }
  }

  /**
   * Mop up step: create web machine actors for existing webs – bots with permissions to add other bots to each existing web,
   * and to create notifications that aren't tied to specific integrations (e.g. related to comments and @mentions).
   *
   * This step is only required to transition existing instances in Dec 2023, and can be deleted once they have been migrated.
   */
  const users = await getEntitiesByType(context, authentication, {
    entityTypeId: "https://hash.ai/@hash/types/entity-type/user/v/1", // @todo this may need to change depending on migration strategy
  });

  for (const user of users) {
    const userAccountId = extractOwnedByIdFromEntityId(
      user.metadata.recordId.entityId,
    );
    try {
      await getWebMachineActorId(context, authentication, {
        ownedById: userAccountId,
      });
    } catch (err) {
      if (err instanceof NotFoundError) {
        await createWebMachineActor(
          context,
          // We have to use the user's authority to add the machine to their web
          { actorId: userAccountId as AccountId },
          {
            ownedById: userAccountId,
          },
        );
        logger.info(`Created web machine actor for user ${userAccountId}`);
      } else {
        throw new Error(
          `Unexpected error attempting to retrieve machine web actor for user ${user.metadata.recordId.entityId}`,
        );
      }
    }
  }

  const orgs = await getEntitiesByType(context, authentication, {
    entityTypeId: "https://hash.ai/@hash/types/entity-type/organization/v/1",
  });

  for (const org of orgs) {
    const orgAccountGroupId = extractOwnedByIdFromEntityId(
      org.metadata.recordId.entityId,
    );
    try {
      await getWebMachineActorId(context, authentication, {
        ownedById: orgAccountGroupId,
      });
    } catch (err) {
      if (err instanceof NotFoundError) {
        const orgAdminAccountId = org.metadata.provenance.recordCreatedById;

        await createWebMachineActor(
          context,
          // We have to use an org admin's authority to add the machine to their web
          { actorId: orgAdminAccountId },
          {
            ownedById: orgAccountGroupId,
          },
        );
        logger.info(`Created web machine actor for org ${orgAccountGroupId}`);
      } else {
        throw new Error(
          `Unexpected error attempting to retrieve machine web actor for organization ${org.metadata.recordId.entityId}`,
        );
      }
    }
  }
  /** End mop-up step, which can be deleted once all existing instances have been migrated */
};

export type PrimitiveDataTypeKey = keyof typeof blockProtocolDataTypes;
