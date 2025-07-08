import type {
  MachineId,
  VersionedUrl,
  WebId,
} from "@blockprotocol/type-system";
import { componentsFromVersionedUrl } from "@blockprotocol/type-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import { NotFoundError } from "@local/hash-backend-utils/error";
import {
  createMachineActorEntity,
  getMachineEntityByIdentifier,
} from "@local/hash-backend-utils/machine-actors";
import { createPolicy, deletePolicyById } from "@local/hash-graph-sdk/policy";
import {
  addActorGroupMember,
  createAiActor,
} from "@local/hash-graph-sdk/principal/actor-group";
import { getWebByShortname } from "@local/hash-graph-sdk/principal/web";
import type { blockProtocolDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { SystemTypeWebShortname } from "@local/hash-isomorphic-utils/ontology-types";

import { enabledIntegrations } from "../../integrations/enabled-integrations";
import { logger } from "../../logger";
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
    .getOrCreateSystemMachine(webShortname)
    .then(({ data }) => data as MachineId);

  const foundWeb = await getWebByShortname(
    context.graphApi,
    { actorId: systemActorMachineId },
    webShortname,
  ).then((web) => {
    if (!web) {
      throw new NotFoundError(
        `Failed to get web for shortname: ${webShortname}`,
      );
    }
    return web;
  });

  logger.debug(
    `Found org entity with shortname ${webShortname}, webId: ${foundWeb.id}, machine actor accountId: ${systemActorMachineId}`,
  );
  owningWebs[webShortname].webId = foundWeb.id;
  owningWebs[webShortname].systemActorMachineId = systemActorMachineId;

  return {
    webId: foundWeb.id,
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

  const machine = await getMachineEntityByIdentifier(context, authentication, {
    identifier: webShortname,
  });
  if (!machine) {
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
      actor: { actorType: "machine", id: systemActorMachineId },
      identifier: webShortname,
      logger,
      webId,
      displayName,
      machineEntityTypeId,
    });

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
        machineEntityTypeVersion: machineEntityTypeId
          ? componentsFromVersionedUrl(machineEntityTypeId).version
          : undefined,
        orgEntityTypeVersion: organizationEntityTypeId
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
  const aiMachine = await getMachineEntityByIdentifier(
    context,
    authentication,
    {
      identifier: "hash-ai",
    },
  );
  if (!aiMachine) {
    const hashWebId = owningWebs.h.webId;
    if (!hashWebId) {
      throw new Error(
        `Somehow reached the point of creating the HASH AI machine actor without a hash webId`,
      );
    }

    const aiIdentifier = "hash-ai";
    const aiAssistantAccountId = await createAiActor(
      context.graphApi,
      authentication,
      {
        identifier: aiIdentifier,
      },
    );

    await addActorGroupMember(context.graphApi, authentication, {
      actorId: aiAssistantAccountId,
      actorGroupId: hashWebId,
    });

    const instantiationPolicyId = await createPolicy(
      context.graphApi,
      authentication,
      {
        name: "tmp-ai-assistant-actor-instantiate",
        effect: "permit",
        principal: {
          type: "actor",
          actorType: "ai",
          id: aiAssistantAccountId,
        },
        actions: ["instantiate"],
        resource: {
          type: "entityType",
          filter: {
            type: "any",
            filters: [
              {
                type: "isBaseUrl",
                baseUrl: systemEntityTypes.actor.entityTypeBaseUrl,
              },
              {
                type: "isBaseUrl",
                baseUrl: systemEntityTypes.machine.entityTypeBaseUrl,
              },
            ],
          },
        },
      },
    );

    await createMachineActorEntity(context, {
      identifier: aiIdentifier,
      logger,
      actor: { actorType: "ai", id: aiAssistantAccountId },
      webId: hashWebId,
      displayName: "HASH AI",
    });

    await deletePolicyById(
      context.graphApi,
      authentication,
      instantiationPolicyId,
      { permanent: true },
    );
  }
};

export type PrimitiveDataTypeKey = keyof typeof blockProtocolDataTypes;
