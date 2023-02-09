import { configureScope, setUser } from "@sentry/nextjs";

import { AuthenticatedUser } from "../../lib/user-and-org";

export const setSentryUser = (params: {
  authenticatedUser?: AuthenticatedUser;
}) => {
  const { authenticatedUser } = params;
  configureScope((scope) => {
    const sentryUser = scope.getUser();
    if (!authenticatedUser && sentryUser) {
      scope.setUser(null);
    } else if (
      authenticatedUser &&
      sentryUser?.id !== authenticatedUser.entity.recordId.entityId
    ) {
      const primaryEmail = authenticatedUser.emails.find(
        (email) => email.primary,
      );
      setUser({
        id: authenticatedUser.entity.recordId.entityId,
        email: primaryEmail?.address,
      });
    }
  });
};
