import { typedEntries } from "@local/advanced-types/typed-entries";
import {
  createMachineActor,
  getMachineActorId,
} from "@local/hash-backend-utils/machine-actors";
import { frontendUrl } from "@local/hash-isomorphic-utils/environment";
import { blockProtocolDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { SystemTypeWebShortname } from "@local/hash-isomorphic-utils/ontology-types";
import { AccountGroupId, AccountId, OwnedById } from "@local/hash-subgraph";

import { enabledIntegrations } from "../../integrations/enabled-integrations";
import { NotFoundError } from "../../lib/error";
import { logger } from "../../logger";
import {
  createAccount,
  createAccountGroup,
  createWeb,
} from "../account-permission-management";
import { ImpureGraphContext } from "../context-types";
import {
  createHashInstance,
  getHashInstance,
} from "../knowledge/system-types/hash-instance";
import { createOrg, getOrgByShortname } from "../knowledge/system-types/org";
import { systemAccountId } from "../system-account";

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
 * Also creates other required system entities, such as the hashInstance entity and AI Assistant.
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

  for (const [
    webShortname,
    { accountGroupId, enabled, machineActorAccountId, name, websiteUrl },
  ] of typedEntries(owningWebs)) {
    if (!enabled) {
      continue;
    }

    if (!accountGroupId) {
      throw new Error(
        `Missing accountGroupId for system web with shortname ${webShortname}`,
      );
    }
    if (!machineActorAccountId) {
      throw new Error(
        `Missing machineActorAccountId for system web with shortname ${webShortname}`,
      );
    }

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

    try {
      await getMachineActorId(context, authentication, {
        identifier: webShortname,
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        await createMachineActor(context, {
          description: `The ${webShortname} machine user`,
          machineAccountId: machineActorAccountId,
          identifier: webShortname,
          ownedById: accountGroupId as OwnedById,
          preferredName: `${webShortname}[bot]`,
        });

        logger.info(
          `Created machine actor entity for '${webShortname}' for accountId ${machineActorAccountId}`,
        );
      } else {
        throw error;
      }
    }
  }

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

  try {
    await getMachineActorId(context, authentication, {
      identifier: "ai-assistant",
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
          `Somehow reached the point of creating the AI Assistant machine actor without a hash accountGroupId`,
        );
      }

      await createMachineActor(context, {
        description: "The AI Assistant machine user",
        identifier: "ai-assistant",
        machineAccountId: aiAssistantAccountId,
        ownedById: hashAccountGroupId as OwnedById,
        preferredName: "AI Assistant",
      });
    } else {
      throw error;
    }
  }
};

export type PrimitiveDataTypeKey = keyof typeof blockProtocolDataTypes;
