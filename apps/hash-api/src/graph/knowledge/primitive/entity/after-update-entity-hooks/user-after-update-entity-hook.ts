import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { UserProperties } from "@local/hash-isomorphic-utils/system-types/user";

import { isProdEnv } from "../../../../../lib/env-config";
import { createOrUpdateMailchimpUser } from "../../../../../mailchimp";
import {
  getUserFromEntity,
  updateUserKratosIdentityTraits,
} from "../../../system-types/user";
import type { UpdateEntityHookCallback } from "../update-entity-hooks";

export const userAfterUpdateEntityHookCallback: UpdateEntityHookCallback =
  async ({ context, previousEntity, updatedProperties }) => {
    const {
      email: updatedEmails,
      shortname,
      displayName,
    } = simplifyProperties(updatedProperties as UserProperties);

    if (isProdEnv) {
      /**
       * @todo: when we allow users to have more than one email, come up with
       * a better way of determining which to use for mailchimp.
       */
      const [email] = updatedEmails;

      await createOrUpdateMailchimpUser({
        email,
        shortname,
        displayName,
      });
    }

    const user = getUserFromEntity({ entity: previousEntity });

    const currentEmails = user.emails;

    if (
      currentEmails.toSorted().join().toLowerCase() !==
      updatedEmails.toSorted().join().toLowerCase()
    ) {
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
