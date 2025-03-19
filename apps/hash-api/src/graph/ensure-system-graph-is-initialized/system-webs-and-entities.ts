import type {
  ActorGroupId,
  ActorId,
  OwnedById,
  VersionedUrl,
} from "@blockprotocol/type-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import { NotFoundError } from "@local/hash-backend-utils/error";
import {
  createMachineActorEntity,
  createWebMachineActor,
  getMachineActorId,
  getWebMachineActorId,
} from "@local/hash-backend-utils/machine-actors";
import type { blockProtocolDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { SystemTypeWebShortname } from "@local/hash-isomorphic-utils/ontology-types";
import { stringifyError } from "@local/hash-isomorphic-utils/stringify-error";
import { componentsFromVersionedUrl } from "@local/hash-subgraph/type-system-patch";

import { enabledIntegrations } from "../../integrations/enabled-integrations";
import { logger } from "../../logger";
import {
  createAccount,
  createAccountGroup,
  createWeb,
} from "../account-permission-management";
import type { ImpureGraphContext } from "../context-types";
import { createOrg, getOrgByShortname } from "../knowledge/system-types/org";
import { systemAccountId } from "../system-account";

export const owningWebs: Record<
  SystemTypeWebShortname,
  {
    machineActorAccountId?: ActorId;
    accountGroupId?: ActorGroupId;
    enabled: boolean;
    name: string;
    websiteUrl: string;
  }
> = {
  h: {
    enabled: true,
    name: "HASH",
    websiteUrl: "https://hash.ai",
  },
  google: {
    enabled: enabledIntegrations.googleSheets,
    name: "Google",
    websiteUrl: "https://www.google.com",
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
): Promise<{ accountGroupId: ActorGroupId; machineActorId: ActorId }> => {
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
    webShortname === "h"
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
  );

  owningWebs[webShortname].accountGroupId = accountGroupId;
  owningWebs[webShortname].machineActorAccountId = machineActorIdForWeb;

  return {
    accountGroupId,
    machineActorId: machineActorIdForWeb,
  };
};

export const ensureSystemWebEntitiesExist = async ({
  context,
  name,
  webShortname,
  websiteUrl,
  machineEntityTypeId,
  organizationEntityTypeId,
}: {
  context: ImpureGraphContext;
  name: string;
  webShortname: SystemTypeWebShortname;
  websiteUrl: string;
  machineEntityTypeId?: VersionedUrl;
  organizationEntityTypeId?: VersionedUrl;
}) => {
  const { accountGroupId, machineActorId: machineActorAccountId } =
    await getOrCreateOwningAccountGroupId(context, webShortname);

  const authentication = { actorId: machineActorAccountId };

  try {
    await getMachineActorId(context, authentication, {
      identifier: webShortname,
    });
  } catch (error) {
    let displayName;

    switch (webShortname) {
      case "h":
        displayName = "HASH";
        break;
      case "google":
        displayName = "Google Integration";
        break;
      case "linear":
        displayName = "Linear Integration";
        break;
      default:
        throw new Error(
          `Unhandled web shortname ${webShortname} requires a display name for the machine actor specified`,
        );
    }

    if (error instanceof NotFoundError) {
      /**
       * Create a machine entity associated with each machine actorId that created system types.
       * These machines may also be added to other webs as needed (e.g. for integration workflows).
       *
       * Note: these are different from the web-scoped machine actors that EVERY org (system or not) has associated with.
       *   - the web-scoped machine actors are for taking action in the web, e.g. to grant other bots permissions in it
       *   - _these_ machine actors are for performing actions across the system related to the types they create, e.g.
       * Linear actions
       */
      await createMachineActorEntity(context, {
        machineAccountId: machineActorAccountId,
        identifier: webShortname,
        logger,
        ownedById: accountGroupId as OwnedById,
        displayName,
        systemAccountId,
        machineEntityTypeId,
      });
    } else {
      throw error;
    }

    /**
     * Check that an Organization entity exists associated with the web.
     * This step must occur after creating machine actor entities, because {@link createWebMachineActor},
     * which is called as part of {@link createOrg}, depends on the 'hash' machine actor entity existing.
     */
    const foundOrg = await getOrgByShortname(context, authentication, {
      shortname: webShortname,
    });

    if (!foundOrg) {
      await createOrg(context, authentication, {
        bypassShortnameValidation: true,
        orgAccountGroupId: accountGroupId,
        shortname: webShortname,
        name,
        websiteUrl,
        entityTypeVersion: organizationEntityTypeId
          ? componentsFromVersionedUrl(organizationEntityTypeId).version
          : undefined,
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
    await ensureSystemWebEntitiesExist({
      context,
      name,
      webShortname,
      websiteUrl,
    });

    const { accountGroupId, machineActorId: machineActorAccountId } =
      await getOrCreateOwningAccountGroupId(context, webShortname);

    try {
      await getWebMachineActorId(
        context,
        { actorId: machineActorAccountId },
        {
          ownedById: accountGroupId as OwnedById,
        },
      );
    } catch (err) {
      if (err instanceof NotFoundError) {
        await createWebMachineActor(
          context,
          // We have to use an org admin's authority to add the machine to their web
          { actorId: machineActorAccountId },
          {
            ownedById: accountGroupId as OwnedById,
            logger,
          },
        );
      } else {
        throw new Error(
          `Unexpected error attempting to retrieve machine web actor for organization ${webShortname}: ${stringifyError(err)}`,
        );
      }
    }
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
      const hashAccountGroupId = owningWebs.h.accountGroupId;
      if (!hashAccountGroupId) {
        throw new Error(
          `Somehow reached the point of creating the HASH AI machine actor without a hash accountGroupId`,
        );
      }

      const aiAssistantAccountId = await createAccount(
        context,
        authentication,
        {},
      );

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
        logger,
        machineAccountId: aiAssistantAccountId,
        ownedById: hashAccountGroupId as OwnedById,
        displayName: "HASH AI",
        systemAccountId,
      });
    } else {
      throw error;
    }
  }
};

export type PrimitiveDataTypeKey = keyof typeof blockProtocolDataTypes;
