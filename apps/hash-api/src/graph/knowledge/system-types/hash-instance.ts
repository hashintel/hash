import type { ActorId, VersionedUrl } from "@blockprotocol/type-system";
import { NotFoundError } from "@local/hash-backend-utils/error";
import type { HashInstance } from "@local/hash-backend-utils/hash-instance";
import {
  getHashInstance,
  getHashInstanceFromEntity,
} from "@local/hash-backend-utils/hash-instance";
import { createPolicy, deletePolicyById } from "@local/hash-graph-sdk/policy";
import { getInstanceAdminsTeam } from "@local/hash-graph-sdk/principal/hash-instance-admins";
import type { HASHInstance as HashInstanceEntity } from "@local/hash-isomorphic-utils/system-types/hashinstance";

import { logger } from "../../../logger";
import type { ImpureGraphFunction } from "../../context-types";
import { createEntity } from "../primitive/entity";

/**
 * Create the hash instance entity.
 *
 * @param params.pagesAreEnabled - whether or not pages are enabled
 * @param params.userSelfRegistrationIsEnabled - whether or not user self registration is enabled
 * @param params.userRegistrationByInviteIsEnabled - whether or not user registration by invitation is enabled
 * @param params.orgSelfRegistrationIsEnabled - whether or not org registration is enabled
 */
export const createHashInstance: ImpureGraphFunction<
  {
    hashInstanceEntityTypeId: VersionedUrl;
    pagesAreEnabled?: boolean;
    userSelfRegistrationIsEnabled?: boolean;
    userRegistrationByInviteIsEnabled?: boolean;
    orgSelfRegistrationIsEnabled?: boolean;
  },
  Promise<HashInstance>
> = async (ctx, authentication, params) => {
  // Ensure the hash instance entity has not already been created.
  const existingHashInstance = await getHashInstance(ctx, authentication).catch(
    (error: Error) => {
      if (error instanceof NotFoundError) {
        return null;
      }
      throw error;
    },
  );

  if (existingHashInstance) {
    throw new Error("HASH instance entity already exists.");
  }

  const { id: teamId, webId } = await getInstanceAdminsTeam(
    ctx,
    authentication,
  );

  logger.info(
    `Retrieved account group for hash instance admins with id: ${teamId}`,
  );

  const instantiationPolicy = await createPolicy(ctx.graphApi, authentication, {
    name: "tmp-hash-instance-instantiate",
    effect: "permit",
    principal: {
      type: "actor",
      ...({
        actorType: ctx.provenance.actorType,
        id: authentication.actorId,
      } as ActorId),
    },
    actions: ["instantiate"],
    resource: {
      type: "entityType",
      id: params.hashInstanceEntityTypeId,
    },
  });

  try {
    const entity = await createEntity<HashInstanceEntity>(ctx, authentication, {
      webId,
      properties: {
        value: {
          "https://hash.ai/@h/types/property-type/pages-are-enabled/": {
            value: params.pagesAreEnabled ?? true,
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1",
            },
          },
          "https://hash.ai/@h/types/property-type/user-self-registration-is-enabled/":
            {
              value: params.userSelfRegistrationIsEnabled ?? true,
              metadata: {
                dataTypeId:
                  "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1",
              },
            },
          "https://hash.ai/@h/types/property-type/user-registration-by-invitation-is-enabled/":
            {
              value: params.userRegistrationByInviteIsEnabled ?? true,
              metadata: {
                dataTypeId:
                  "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1",
              },
            },
          "https://hash.ai/@h/types/property-type/org-self-registration-is-enabled/":
            {
              value: params.orgSelfRegistrationIsEnabled ?? true,
              metadata: {
                dataTypeId:
                  "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1",
              },
            },
        },
      },
      entityTypeIds: [
        params.hashInstanceEntityTypeId,
      ] as HashInstanceEntity["entityTypeIds"],
    });

    return getHashInstanceFromEntity({ entity });
  } finally {
    await deletePolicyById(ctx.graphApi, authentication, instantiationPolicy, {
      permanent: true,
    });
  }
};
