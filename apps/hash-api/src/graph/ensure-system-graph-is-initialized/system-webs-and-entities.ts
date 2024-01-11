import { typedEntries } from "@local/advanced-types/typed-entries";
import { NotFoundError } from "@local/hash-backend-utils/error";
import {
  createMachineActorEntity,
  getMachineActorId,
} from "@local/hash-backend-utils/machine-actors";
import { frontendUrl } from "@local/hash-isomorphic-utils/environment";
import { blockProtocolDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { SystemTypeWebShortname } from "@local/hash-isomorphic-utils/ontology-types";
import {
  AccountGroupId,
  AccountId,
  extractOwnedByIdFromEntityId,
  OwnedById,
} from "@local/hash-subgraph";

import { enabledIntegrations } from "../../integrations/enabled-integrations";
import { logger } from "../../logger";
import {
  createAccount,
  createAccountGroup,
  createWeb,
} from "../account-permission-management";
import { ImpureGraphContext } from "../context-types";
import { createOrg, getOrgByShortname } from "../knowledge/system-types/org";
import { systemAccountId } from "../system-account";

// Whether this is a self-hosted instance, rather than the central HASH hosted instance
export const isSelfHostedInstance =
  process.env.SELF_HOSTED_HASH === "true" ||
  !["http://localhost:3000", "https://app.hash.ai", "https://hash.ai"].includes(
    frontendUrl,
  );

export const owningWebs: Record<
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
    /**
     *  If this function is used again after the initial seeding, it's possible that we've created the org in the past.
     */
    const foundOrg = await getOrgByShortname(
      context,
      { actorId: systemAccountId },
      {
        shortname: webShortname,
      },
    );

    if (foundOrg) {
      const machineActorIdForWeb =
        foundOrg.entity.metadata.provenance.edition.createdById;

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

export const createSystemWebEntities = async ({
  context,
  name,
  webShortname,
  websiteUrl,
}: {
  context: ImpureGraphContext;
  name: string;
  webShortname: SystemTypeWebShortname;
  websiteUrl: string;
}) => {
  const { accountGroupId, machineActorId: machineActorAccountId } =
    await getOrCreateOwningAccountGroupId(context, webShortname);

  const authentication = { actorId: machineActorAccountId };

  /**
   * Create a machine entity associated with each machine actorId that created system types.
   * These machines may also be added to other webs as needed (e.g. for integration workflows).
   *
   * Note: these are different from the web-scoped machine actors that EVERY org (system or not) has associated with.
   *   - the web-scoped machine actors are for taking action in the web, e.g. to grant other bots permissions in it
   *   - _these_ machine actors are for performing actions across the system related to the types they create, e.g. Linear actions
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
        `Created machine actor entity for '${webShortname}'-related functionality, using accountId ${machineActorAccountId} in accountGroupId '${accountGroupId}`,
      );
    } else {
      throw error;
    }

    /**
     * Check that an Organization entity exists associated with the web.
     * This step must occur after creating machine actor entities, because:
     * 1. {@link createWebMachineActor} is called as part of {@link createOrg}
     * 2. createWebMachineActor internally depends on the 'hash' machine actor entity existing
     */
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
  }
};

/**
 * Ensures that there are entities associated with each:
 * - system web (create an Organization associated with it)
 * - machine actor that creates the web (create a Machine associated with it)
 *
 * Also creates other required system entities, such as the HASH AI Assistant.
 */
export const ensureSystemEntitiesExist = async (params: {
  context: ImpureGraphContext;
}) => {
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

    /**
     *  This should have already been called for 'hash' as part of migration 005.
     *
     *  For other system webs, this may have an effect if it the first migration run the web has been seen/enabled in.
     */
    await createSystemWebEntities({ context, name, webShortname, websiteUrl });
  }

  const authentication = { actorId: systemAccountId };

  /**
   * Create the HASH _AI_ Machine actor and entity, which is added as needed to webs to run AI-related workflows.
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
};

export type PrimitiveDataTypeKey = keyof typeof blockProtocolDataTypes;
