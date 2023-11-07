import { faBell } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import {
  Box,
  svgIconClasses,
  Typography,
  typographyClasses,
  useTheme,
} from "@mui/material";
import { FunctionComponent, useMemo } from "react";

import { useNotifications } from "../../notifications-context";
import { Link } from "../../ui";
import { HeaderIconButton } from "./shared/header-icon-button";

export const NotificationsDropdown: FunctionComponent = () => {
  const theme = useTheme();

  const { notifications } = useNotifications();

  const numberOfUnreadNotifications = useMemo(
    () => notifications?.filter(({ readAt }) => !readAt).length,
    [notifications],
  );

  const hasNotifications = !!numberOfUnreadNotifications;

  return (
    <Link noLinkStyle href="/inbox">
      <HeaderIconButton
        sx={{
          fontSize: theme.spacing(2),
          width: hasNotifications ? "auto" : "32px",
          px: hasNotifications ? 1.5 : "unset",
          height: "32px",
          borderRadius: hasNotifications ? 4 : "100%",
          backgroundColor: theme.palette.blue[70],
          [`.${svgIconClasses.root}`]: {
            color: hasNotifications
              ? `${theme.palette.blue[70]} !important`
              : undefined,
          },
          [`.${typographyClasses.root}`]: {
            color: `${theme.palette.blue[100]} !important`,
          },
          ".circle": {
            backgroundColor: `${theme.palette.blue[70]} !important`,
          },
          /**
           * @todo: figure out why `!important` is required for styles
           * to be added to the stylesheet
           */
          "&:hover": {
            [`.${svgIconClasses.root}`]: {
              color: `${theme.palette.blue[60]} !important`,
            },
            [`.${typographyClasses.root}`]: {
              color: `${theme.palette.blue[90]} !important`,
            },
            ".circle": {
              backgroundColor: `${theme.palette.blue[60]} !important`,
            },
          },
          "&:active": {
            [`.${svgIconClasses.root}`]: {
              color: `${theme.palette.common.white} !important`,
            },
            [`.${typographyClasses.root}`]: {
              color: `${theme.palette.common.white} !important`,
            },
          },
          "&:focus-visible:after": {
            borderRadius: hasNotifications ? 10 : "100%",
          },
        }}
      >
        <FontAwesomeIcon icon={faBell} sx={{ color: theme.palette.blue[70] }} />
        {hasNotifications && (
          <>
            <Typography
              sx={{
                fontWeight: 600,
                lineHeight: theme.spacing(2),
                color: "purple",
              }}
              ml={0.75}
            >
              {numberOfUnreadNotifications}
            </Typography>
            <Box
              className="circle"
              sx={{
                position: "absolute",
                backgroundColor: theme.palette.blue[70],
                width: 8,
                height: 8,
                borderRadius: "50%",
                top: 0,
                right: 0,
              }}
            />
          </>
        )}
      </HeaderIconButton>
    </Link>
  );
};
