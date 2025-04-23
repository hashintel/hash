import type {
  ActorGroupEntityUuid,
  MachineId,
  VersionedUrl,
  WebId,
} from "@blockprotocol/type-system";
import { componentsFromVersionedUrl } from "@blockprotocol/type-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import { NotFoundError } from "@local/hash-backend-utils/error";
import {
  createMachineActorEntity,
  getMachineIdByIdentifier,
} from "@local/hash-backend-utils/machine-actors";
import type { blockProtocolDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { SystemTypeWebShortname } from "@local/hash-isomorphic-utils/ontology-types";

import { enabledIntegrations } from "../../integrations/enabled-integrations";
import { logger } from "../../logger";
import {
  addActorGroupMember,
  createAiActor,
  findWebByShortname,
} from "../account-permission-management";
import type { ImpureGraphContext } from "../context-types";
import { createOrg, getOrgByShortname } from "../knowledge/system-types/org";
import { systemAccountId } from "../system-account";

export const owningWebs: Record<
  SystemTypeWebShortname,
  {
    systemActorMachineId?: MachineId;
    webId?: WebId;
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

export const getOrCreateOwningWebId = async (
  context: ImpureGraphContext,
  webShortname: SystemTypeWebShortname,
): Promise<{
  webId: WebId;
  systemActorMachineId: MachineId;
}> => {
  // We only need to resolve this once for each shortname during the seeding process
  const resolvedWebId = owningWebs[webShortname].webId;
  const resolvedSystemActorMachineId =
    owningWebs[webShortname].systemActorMachineId;

  // After this function has been run once, these should exist
  if (resolvedWebId && resolvedSystemActorMachineId) {
    return {
      webId: resolvedWebId,
      systemActorMachineId: resolvedSystemActorMachineId,
    };
  }

  /**
   *  If this function is used again after the initial seeding, it's possible that we've created the org in the past.
   */
  const systemActorMachineId = await context.graphApi
    .getOrCreateSystemActor(webShortname)
    .then(({ data }) => data as MachineId);
  const foundWeb = await findWebByShortname(
    context,
    { actorId: systemAccountId },
    {
      shortname: webShortname,
    },
  );

  logger.debug(
    `Found org entity with shortname ${webShortname}, webId: ${foundWeb.webId}, machine actor accountId: ${systemActorMachineId}`,
  );
  owningWebs[webShortname].webId = foundWeb.webId;
  owningWebs[webShortname].systemActorMachineId = systemActorMachineId;

  return {
    webId: foundWeb.webId,
    systemActorMachineId,
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
  const { webId, systemActorMachineId } = await getOrCreateOwningWebId(
    context,
    webShortname,
  );

  const authentication = { actorId: systemActorMachineId };

  try {
    await getMachineIdByIdentifier(context, authentication, {
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
        machineId: systemActorMachineId,
        identifier: webShortname,
        logger,
        webId,
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
        webId,
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
     *  This should have already been called for 'h' as part of migration 005.
     *
     *  For other system webs, this may have an effect if it the first migration run the web has been seen/enabled in.
     */
    await ensureSystemWebEntitiesExist({
      context,
      name,
      webShortname,
      websiteUrl,
    });
  }

  const authentication = { actorId: systemAccountId };

  /**
   * Create the HASH _AI_ Machine actor and entity, which is added as needed to webs to run AI-related workflows.
   */
  try {
    await getMachineIdByIdentifier(context, authentication, {
      identifier: "hash-ai",
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      const hashWebId = owningWebs.h.webId;
      if (!hashWebId) {
        throw new Error(
          `Somehow reached the point of creating the HASH AI machine actor without a hash webId`,
        );
      }

      const aiIdentifier = "hash-ai";
      const aiAssistantAccountId = await createAiActor(
        context,
        authentication,
        {
          identifier: aiIdentifier,
        },
      );

      await addActorGroupMember(context, authentication, {
        actorId: aiAssistantAccountId,
        actorGroupId: hashWebId as ActorGroupEntityUuid,
      });
      await context.graphApi.modifyWebAuthorizationRelationships(
        systemAccountId,
        [
          {
            operation: "create",
            resource: hashWebId,
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
            resource: hashWebId,
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
        identifier: aiIdentifier,
        logger,
        machineId: aiAssistantAccountId,
        webId: hashWebId,
        displayName: "HASH AI",
        systemAccountId,
      });
    } else {
      throw error;
    }
  }
};

export type PrimitiveDataTypeKey = keyof typeof blockProtocolDataTypes;
