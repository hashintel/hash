import { configureScope, setUser } from "@sentry/nextjs";

import type { User } from "../../lib/user-and-org";

export const setSentryUser = (params: { authenticatedUser?: User }) => {
  const { authenticatedUser } = params;
  configureScope((scope) => {
    const sentryUser = scope.getUser();
    if (!authenticatedUser && sentryUser) {
      scope.setUser(null);
    } else if (
      authenticatedUser &&
      sentryUser?.id !== authenticatedUser.entity.metadata.recordId.entityId
    ) {
      const primaryEmail = authenticatedUser.emails.find(
        (email) => email.primary,
      );
      setUser({
        id: authenticatedUser.entity.metadata.recordId.entityId,
        email: primaryEmail?.address,
      });
    }
  });
};
