import { getDefinedPropertyFromPatchesRetriever } from "@local/hash-graph-sdk/entity";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { UserProperties } from "@local/hash-isomorphic-utils/system-types/user";

import { isProdEnv } from "../../../../../lib/env-config";
import { createOrUpdateMailchimpUser } from "../../../../../mailchimp";
import {
  getUserFromEntity,
  updateUserKratosIdentityTraits,
} from "../../../system-types/user";
import type { AfterUpdateEntityHookCallback } from "../update-entity-hooks";

export const userAfterUpdateEntityHookCallback: AfterUpdateEntityHookCallback =
  async ({ context, propertyPatches, updatedEntity }) => {
    const getNewValueForPath =
      getDefinedPropertyFromPatchesRetriever<UserProperties>(propertyPatches);

    const updatedEmails = getNewValueForPath(
      "https://hash.ai/@hash/types/property-type/email/",
    );

    const { shortname, displayName } = simplifyProperties(
      updatedEntity.properties as UserProperties,
    );

    if (updatedEmails?.[0] && isProdEnv) {
      /**
       * @todo: when we allow users to have more than one email, come up with
       * a better way of determining which to use for mailchimp.
       */
      const email = updatedEmails[0];

      await createOrUpdateMailchimpUser({
        email,
        shortname,
        displayName,
      });
    }

    const user = getUserFromEntity({ entity: updatedEntity });

    if (updatedEmails) {
      await updateUserKratosIdentityTraits(
        context,
        { actorId: user.accountId },
        {
          user,
          updatedTraits: {
            emails: updatedEmails,
          },
        },
      );
    }
  };
