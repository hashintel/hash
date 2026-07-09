import { faBell } from "@fortawesome/free-solid-svg-icons";
import { Tooltip, useTheme } from "@mui/material";

import { FontAwesomeIcon } from "@hashintel/design-system";

import { getInboxHref } from "../../get-inbox-href";
import { useInvites } from "../../invites-context";
import { useNotificationCount } from "../../notification-count-context";
import { Link } from "../../ui";
import { HeaderIconButtonWithCount } from "./shared/header-icon-button-with-count";

import type { FunctionComponent } from "react";

export const NotificationsDropdown: FunctionComponent = () => {
  const theme = useTheme();

  const { numberOfUnreadNotifications } = useNotificationCount();
  const { pendingInvites } = useInvites();

  const href = getInboxHref({
    fallbackHref: "/notifications",
    includeDraftEntityActions: false,
    numberOfPendingInvites: pendingInvites.length,
    numberOfUnreadNotifications,
  });

  return (
    <Tooltip title="Notifications" placement="bottom">
      <Link noLinkStyle href={href}>
        <HeaderIconButtonWithCount
          icon={
            <FontAwesomeIcon
              icon={faBell}
              sx={{ color: theme.palette.blue[70] }}
            />
          }
          count={(numberOfUnreadNotifications ?? 0) + pendingInvites.length}
        />
      </Link>
    </Tooltip>
  );
};
