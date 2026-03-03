import type { Logger } from "@local/hash-backend-utils/logger";
import { queryEntities } from "@local/hash-graph-sdk/entity";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { User as UserEntity } from "@local/hash-isomorphic-utils/system-types/user";
import type { Identity } from "@ory/kratos-client";

import type { ImpureGraphContext } from "../graph/context-types";
import { getUserFromEntity } from "../graph/knowledge/system-types/user";
import { systemAccountId } from "../graph/system-account";
import { deleteKratosIdentity, kratosIdentityApi } from "./ory-kratos";

/**
 * Identities created before this date are excluded from cleanup, preventing
 * retroactive deletion of accounts that existed before email verification
 * was introduced.
 */
const DEFAULT_ROLLOUT_AT = new Date("2026-02-14T00:00:00.000Z");
const DEFAULT_RELEASE_TTL_HOURS = 24 * 7;
const DEFAULT_SWEEP_INTERVAL_MINUTES = 60;

const parsePositiveIntegerEnv = (
  rawValue: string | undefined,
  fallback: number,
  envVarName: string,
) => {
  if (!rawValue) {
    return fallback;
  }

  const parsedValue = Number.parseInt(rawValue, 10);
  if (Number.isNaN(parsedValue) || parsedValue <= 0) {
    throw new Error(
      `${envVarName} must be a positive integer, got "${rawValue}"`,
    );
  }

  return parsedValue;
};

const parseRolloutDate = (rawValue: string | undefined): Date => {
  if (!rawValue) {
    return DEFAULT_ROLLOUT_AT;
  }

  const parsedDate = new Date(rawValue);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error(
      `HASH_EMAIL_VERIFICATION_ROLLOUT_AT must be an ISO-8601 date, got "${rawValue}"`,
    );
  }

  return parsedDate;
};

const parseIdentityCreatedAt = (identity: Identity): Date | undefined => {
  if (!identity.created_at) {
    return undefined;
  }

  const createdAt = new Date(identity.created_at);

  if (Number.isNaN(createdAt.getTime())) {
    return undefined;
  }

  return createdAt;
};

const isPrimaryEmailVerified = (identity: Identity): boolean => {
  const identityTraits = identity.traits as { emails?: string[] };
  const primaryEmailAddress = identityTraits.emails?.[0];

  if (!primaryEmailAddress) {
    return false;
  }

  return (
    identity.verifiable_addresses?.find(
      ({ value }) => value === primaryEmailAddress,
    )?.verified === true
  );
};

export const createUnverifiedEmailCleanupJob = ({
  context,
  logger,
}: {
  context: ImpureGraphContext;
  logger: Logger;
}) => {
  const rolloutAt = parseRolloutDate(
    process.env.HASH_EMAIL_VERIFICATION_ROLLOUT_AT,
  );

  const releaseTtlHours = parsePositiveIntegerEnv(
    process.env.HASH_EMAIL_VERIFICATION_RELEASE_TTL_HOURS,
    DEFAULT_RELEASE_TTL_HOURS,
    "HASH_EMAIL_VERIFICATION_RELEASE_TTL_HOURS",
  );

  const sweepIntervalMinutes = parsePositiveIntegerEnv(
    process.env.HASH_EMAIL_VERIFICATION_RELEASE_SWEEP_INTERVAL_MINUTES,
    DEFAULT_SWEEP_INTERVAL_MINUTES,
    "HASH_EMAIL_VERIFICATION_RELEASE_SWEEP_INTERVAL_MINUTES",
  );

  const releaseTtlMs = releaseTtlHours * 60 * 60 * 1_000;
  const sweepIntervalMs = sweepIntervalMinutes * 60 * 1_000;

  const cleanupUnverifiedUsers = async () => {
    const now = Date.now();
    const authentication = { actorId: systemAccountId };

    const { entities: userEntities } = await queryEntities<UserEntity>(
      context,
      authentication,
      {
        filter: {
          all: [
            generateVersionedUrlMatchingFilter(
              systemEntityTypes.user.entityTypeId,
              {
                ignoreParents: true,
              },
            ),
            {
              equal: [{ path: ["archived"] }, { parameter: false }],
            },
          ],
        },
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
        includePermissions: false,
      },
    );

    let releasedEmailCount = 0;

    for (const userEntity of userEntities) {
      const user = getUserFromEntity({ entity: userEntity });

      if (user.isAccountSignupComplete) {
        continue;
      }

      try {
        const { data: identity } = await kratosIdentityApi.getIdentity({
          id: user.kratosIdentityId,
        });

        const createdAt = parseIdentityCreatedAt(identity);
        if (!createdAt || createdAt < rolloutAt) {
          continue;
        }

        if (now - createdAt.getTime() < releaseTtlMs) {
          continue;
        }

        const primaryEmail = user.emails[0];
        if (!primaryEmail) {
          logger.warn(
            `User ${user.accountId} (${user.kratosIdentityId}) has no email addresses, skipping`,
          );
          continue;
        }

        if (isPrimaryEmailVerified(identity)) {
          continue;
        }

        await user.entity.archive(
          context.graphApi,
          authentication,
          context.provenance,
        );
        await deleteKratosIdentity({
          kratosIdentityId: user.kratosIdentityId,
        });

        releasedEmailCount += 1;
      } catch (error) {
        logger.warn(
          `Failed to process unverified user ${user.accountId} (${user.kratosIdentityId}) for email release: ${error}`,
        );
      }
    }

    if (releasedEmailCount > 0) {
      logger.info(
        `Released ${releasedEmailCount} unverified email address${releasedEmailCount === 1 ? "" : "es"}.`,
      );
    }
  };

  let interval: NodeJS.Timeout | undefined;
  let inFlightCleanup: Promise<void> | undefined;

  return {
    start: async () => {
      logger.info(
        `Starting unverified-email cleanup job (rolloutAt=${rolloutAt.toISOString()}, ttlHours=${releaseTtlHours}, intervalMinutes=${sweepIntervalMinutes})`,
      );

      await cleanupUnverifiedUsers();
      interval = setInterval(() => {
        inFlightCleanup = cleanupUnverifiedUsers();
      }, sweepIntervalMs);
    },
    stop: async () => {
      if (interval) {
        clearInterval(interval);
      }
      await inFlightCleanup;
    },
  };
};
