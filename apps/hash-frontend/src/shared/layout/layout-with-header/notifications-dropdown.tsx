import { faBell } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import { Tooltip, useTheme } from "@mui/material";
import type { FunctionComponent } from "react";

import { useNotificationEntities } from "../../notification-entities-context";
import { Link } from "../../ui";
import { HeaderIconButtonWithCount } from "./shared/header-icon-button-with-count";

export const NotificationsDropdown: FunctionComponent = () => {
  const theme = useTheme();

  const { numberOfUnreadNotifications } = useNotificationEntities();

  return (
    <Tooltip title="Notifications" placement="bottom">
      <Link noLinkStyle href="/inbox">
        <HeaderIconButtonWithCount
          icon={
            <FontAwesomeIcon
              icon={faBell}
              sx={{ color: theme.palette.blue[70] }}
            />
          }
          count={numberOfUnreadNotifications}
        />
      </Link>
    </Tooltip>
  );
};
