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
      sentryUser?.id !== authenticatedUser.entityEditionId.baseId
    ) {
      const primaryEmail = authenticatedUser.emails.find(
        (email) => email.primary,
      );
      setUser({
        id: authenticatedUser.entityEditionId.baseId,
        email: primaryEmail?.address,
      });
    }
  });
};
