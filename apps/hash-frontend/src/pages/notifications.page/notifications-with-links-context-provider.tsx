import {
  NotificationsWithLinksContext,
  useNotificationsWithLinksContextValue,
} from "./notifications-with-links-context";

import type { FunctionComponent, PropsWithChildren } from "react";

/**
 * Context to provide full information on notifications, for use on the notifications page.
 * A separate app-wide context provides only a count of notifications.
 */
export const NotificationsWithLinksContextProvider: FunctionComponent<
  PropsWithChildren
> = ({ children }) => {
  const value = useNotificationsWithLinksContextValue();

  return (
    <NotificationsWithLinksContext.Provider value={value}>
      {children}
    </NotificationsWithLinksContext.Provider>
  );
};
