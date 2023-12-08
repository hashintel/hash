import { frontendUrl } from "@local/hash-isomorphic-utils/environment";
import { blockProtocolDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { SystemTypeWebShortname } from "@local/hash-isomorphic-utils/ontology-types";
import { AccountGroupId, AccountId, OwnedById } from "@local/hash-subgraph";

import { enabledIntegrations } from "../integrations/enabled-integrations";
import { logger } from "../logger";
import {
  createAccount,
  createAccountGroup,
  createWeb,
} from "./account-permission-management";
import { ImpureGraphContext } from "./context-types";
import { systemAccountId } from "./ensure-hash-system-account-exists";
import { createMachineEntity } from "./knowledge/system-types/machine";
import { createOrg, getOrgByShortname } from "./knowledge/system-types/org";

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

  await createMachineEntity(context, {
    identifier: webShortname,
    machineAccountId: machineActorIdForWeb,
    owningWebAccountGroupId: accountGroupId,
  });

  logger.info(
    `Created accountGroup for web with shortname ${webShortname}, accountGroupId: ${accountGroupId}`,
    `Created machine actor and entity for web with shortname ${webShortname}, machineActorId: ${machineActorIdForWeb}`,
  );

  owningWebs[webShortname].accountGroupId = accountGroupId;
  owningWebs[webShortname].machineActorAccountId = machineActorIdForWeb;

  return {
    accountGroupId,
    machineActorId: machineActorIdForWeb,
  };
};

export const ensureAccountGroupOrgsExist = async (params: {
  context: ImpureGraphContext;
}) => {
  if (isSelfHostedInstance) {
    return;
  }

  const { context } = params;

  logger.debug("Ensuring account group organization entities exist");

  for (const [webShortname, { enabled, name, websiteUrl }] of Object.entries(
    owningWebs,
  )) {
    if (!enabled) {
      continue;
    }

    const authentication = { actorId: systemAccountId };
    const foundOrg = await getOrgByShortname(context, authentication, {
      shortname: webShortname,
    });

    if (!foundOrg) {
      const { accountGroupId, machineActorId } =
        await getOrCreateOwningAccountGroupId(
          context,
          webShortname as SystemTypeWebShortname,
        );

      await createOrg(
        context,
        { actorId: machineActorId },
        {
          orgAccountGroupId: accountGroupId,
          shortname: webShortname,
          name,
          websiteUrl,
        },
      );

      logger.info(
        `Created organization entity for '${webShortname}' with accountGroupId '${accountGroupId}'`,
      );
    }
  }
};

export type PrimitiveDataTypeKey = keyof typeof blockProtocolDataTypes;
