import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { UserProperties } from "@local/hash-isomorphic-utils/system-types/user";

import { isProdEnv } from "../../../../../lib/env-config";
import { createOrUpdateMailchimpUser } from "../../../../../mailchimp";
import { UpdateEntityHookCallback } from "../update-entity-hooks";

export const userAfterUpdateEntityHookCallback: UpdateEntityHookCallback =
  async ({ entity }) => {
    if (isProdEnv) {
      const {
        email: emails,
        shortname,
        displayName,
      } = simplifyProperties(entity.properties as UserProperties);

      /**
       * @todo: when we allow users to have more than one email, come up with
       * a better way of determining which to use for mailchimp.
       */
      const [email] = emails;

      await createOrUpdateMailchimpUser({
        email,
        shortname,
        displayName,
      });
    }
  };
