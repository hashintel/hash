import { frontendUrl } from "@local/hash-isomorphic-utils/environment";
import { blockProtocolDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { SystemTypeWebShortname } from "@local/hash-isomorphic-utils/ontology-types";
import { AccountGroupId, OwnedById } from "@local/hash-subgraph";

import { enabledIntegrations } from "../integrations/enabled-integrations";
import { logger } from "../logger";
import { createAccountGroup, createWeb } from "./account-permission-management";
import { ImpureGraphContext } from "./context-types";
import { systemAccountId } from "./ensusre-system-accounts-exist";
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
) => {
  const authentication = { actorId: systemAccountId };

  if (isSelfHostedInstance) {
    throw new Error(
      "Should not create owning organization for system types on self-hosted instance – system types should be loaded as external types instead",
    );
  }

  // We only need to resolve this once for each shortname during the seeding process
  const resolvedAccountGroupId = owningWebs[webShortname].accountGroupId;
  if (resolvedAccountGroupId) {
    return resolvedAccountGroupId;
  }

  try {
    // If this function is used again after the initial seeding, it's possible that we've created the org in the past
    const foundOrg = await getOrgByShortname(context, authentication, {
      shortname: webShortname,
    });

    if (foundOrg) {
      logger.debug(
        `Found org entity with shortname ${webShortname}, accountGroupId: ${foundOrg.accountGroupId}`,
      );
      owningWebs[webShortname].accountGroupId = foundOrg.accountGroupId;
      return foundOrg.accountGroupId;
    }
  } catch {
    // No org system type yet, this must be the first time the seeding has run
  }

  // The systemAccountId will automatically be assigned as an owner of the account group since it creates it
  const accountGroupId = await createAccountGroup(context, authentication, {});

  await createWeb(context, authentication, {
    ownedById: accountGroupId as OwnedById,
    owner: { kind: "accountGroup", subjectId: accountGroupId },
  });

  owningWebs[webShortname].accountGroupId = accountGroupId;

  logger.info(
    `Created accountGroup for org with shortname ${webShortname}, accountGroupId: ${accountGroupId}`,
  );

  return accountGroupId;
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
      const orgAccountGroupId = await getOrCreateOwningAccountGroupId(
        context,
        webShortname as SystemTypeWebShortname,
      );

      await createOrg(context, authentication, {
        orgAccountGroupId,
        shortname: webShortname,
        name,
        websiteUrl,
      });

      logger.info(
        `Created organization entity for '${webShortname}' with accountGroupId '${orgAccountGroupId}'`,
      );
    }
  }
};

export type PrimitiveDataTypeKey = keyof typeof blockProtocolDataTypes;
