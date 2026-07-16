import { enabledFeatureFlagsPropertyBaseUrl } from "@local/hash-graph-sdk/user-entity-restrictions";
import { featureFlags } from "@local/hash-isomorphic-utils/feature-flags";

import { createKratosIdentity } from "../auth/ory-kratos";
import { createUser, getUser } from "../graph/knowledge/system-types/user";
import { systemAccountId } from "../graph/system-account";
import { isDevEnv, isTestEnv } from "../lib/env-config";

import type { ImpureGraphContext } from "../graph/context-types";
import type { User } from "../graph/knowledge/system-types/user";
import type { Logger } from "@local/hash-backend-utils/logger";
import type { FeatureFlag } from "@local/hash-isomorphic-utils/feature-flags";
import type { EnabledFeatureFlagsPropertyValueWithMetadata } from "@local/hash-isomorphic-utils/system-types/shared";
import type { AxiosError } from "axios";

type SeededUser = {
  email: string;
  shortname: string;
  displayName: string;
  enabledFeatureFlags?: FeatureFlag[];
  isInstanceAdmin?: boolean;
  // If not set, default to "password"
  password?: string;
};

const devUsers: readonly SeededUser[] = [
  {
    email: "admin@example.com",
    shortname: "instance-admin",
    displayName: "Instance Admin",
    isInstanceAdmin: true,
  },
  {
    email: "alice@example.com",
    shortname: "alice",
    // Alice has all non-document editing features enabled
    enabledFeatureFlags: Array.from(featureFlags).filter(
      (flag) => !["pages", "canvases", "documents", "notes"].includes(flag),
    ),
    displayName: "Alice",
  },
  {
    email: "bob@example.com",
    shortname: "bob01",
    displayName: "Bob",
    // Bob exercises the supply-chain views without the full feature set.
    enabledFeatureFlags: ["supplyChain"],
  },
] as const;

export const ensureUsersAreSeeded = async ({
  logger,
  context,
}: {
  logger: Logger;
  context: ImpureGraphContext;
}): Promise<User[]> => {
  const createdUsers = [];
  const authentication = { actorId: systemAccountId };

  // Only use `devUsers` if we are in a dev environment
  let usersToSeed = isDevEnv || isTestEnv ? devUsers : [];

  // Or if we're explicitly setting users to seed.
  if (process.env.HASH_SEED_USERS) {
    try {
      /** @todo validate the JSON parsed from the environment. */
      usersToSeed = JSON.parse(process.env.HASH_SEED_USERS) as SeededUser[];
    } catch {
      logger.error(
        "Could not parse environment variable `HASH_SEED_USERS` as JSON. Make sure it's formatted correctly.",
      );
    }
  }

  for (let index = 0; index < usersToSeed.length; index++) {
    const {
      email,
      shortname,
      displayName,
      enabledFeatureFlags,
      password = "password",
      isInstanceAdmin,
    } = usersToSeed[index]!;

    if (!(email && shortname && displayName)) {
      logger.error(
        `User entry at index ${index} is missing email, shortname or displayName!`,
      );
      continue;
    }
    const maybeNewIdentity = await createKratosIdentity({
      traits: { emails: [email] },
      credentials: {
        password: {
          config: {
            password,
          },
        },
      },
      verifyEmails: isDevEnv || isTestEnv,
    }).catch((error: AxiosError) => {
      if (error.response?.status === 409) {
        // The user already exists on 409 CONFLICT, which is fine
        return null;
      } else {
        logger.warn(
          `Could not create seeded user identity, email = "${email}".`,
        );
        return Promise.reject(error);
      }
    });

    if (maybeNewIdentity !== null) {
      const { traits, id: kratosIdentityId } = maybeNewIdentity;
      const { emails } = traits;

      const user = await createUser(context, authentication, {
        emails,
        kratosIdentityId,
        isInstanceAdmin,
        enabledFeatureFlags,
        shortname,
        displayName,
      });

      createdUsers.push(user);
    } else if (enabledFeatureFlags) {
      /**
       * The user already exists (seeded on an earlier boot) — sync their
       * feature flags with the seed definition, so flags added to the seed
       * later reach existing dev users.
       *
       * The patch is made as the user themself, directly via the SDK (the
       * Node API's instance-admin check on feature-flag changes is a
       * runtime authorization concern that doesn't apply to dev seeding —
       * `createUser` sets the same flags without it on first boot).
       */
      const existingUser = await getUser(context, authentication, {
        shortname,
      });

      const currentFlags = existingUser?.enabledFeatureFlags ?? [];
      if (
        existingUser &&
        [...currentFlags].sort().join(",") !==
          [...enabledFeatureFlags].sort().join(",")
      ) {
        await existingUser.entity.patch(
          context.graphApi,
          { actorId: existingUser.accountId },
          {
            propertyPatches: [
              {
                op: "add",
                path: [enabledFeatureFlagsPropertyBaseUrl],
                property: {
                  value: enabledFeatureFlags.map((flag) => ({
                    value: flag,
                    metadata: {
                      dataTypeId:
                        "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                    },
                  })),
                } satisfies EnabledFeatureFlagsPropertyValueWithMetadata,
              },
            ],
            provenance: context.provenance,
            additionalAllowedPropertyBaseUrls: new Set([
              enabledFeatureFlagsPropertyBaseUrl,
            ]),
          },
        );
        logger.info(
          `Updated feature flags for existing seeded user "${shortname}": [${enabledFeatureFlags.join(", ")}]`,
        );
      }
    }

    logger.info(`Seeded User available, email = "${email}".`);
  }

  return createdUsers;
};
