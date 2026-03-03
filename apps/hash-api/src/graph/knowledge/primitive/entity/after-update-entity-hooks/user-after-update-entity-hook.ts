import { getDefinedPropertyFromPatchesGetter } from "@local/hash-graph-sdk/entity";
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
      getDefinedPropertyFromPatchesGetter<UserProperties>(propertyPatches);

    const updatedEmails = getNewValueForPath(
      "https://hash.ai/@h/types/property-type/email/",
    );

    const { shortname, displayName, email } = simplifyProperties(
      updatedEntity.properties as UserProperties,
    );

    const hasEmailChanged =
      updatedEmails &&
      updatedEmails.sort().join(",") !== email.sort().join(",");

    if (hasEmailChanged && isProdEnv) {
      /**
       * @todo H-4936: when we allow users to have more than one email, come up with
       * a better way of determining which to use for mailchimp.
       */
      const newEmail = updatedEmails[0];

      await createOrUpdateMailchimpUser({
        email: newEmail,
        shortname,
        displayName,
      });
    }

    const user = getUserFromEntity({ entity: updatedEntity });

    if (hasEmailChanged) {
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
