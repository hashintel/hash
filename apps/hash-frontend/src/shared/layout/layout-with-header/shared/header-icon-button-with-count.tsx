import {
  Box,
  svgIconClasses,
  Typography,
  typographyClasses,
} from "@mui/material";
import type { FunctionComponent, ReactNode } from "react";

import { HeaderIconButton } from "./header-icon-button";

export const HeaderIconButtonWithCount: FunctionComponent<{
  count?: number;
  icon: ReactNode;
}> = ({ count, icon }) => {
  const isDisplayingCount = !!count;

  return (
    <HeaderIconButton
      sx={(theme) => ({
        width: isDisplayingCount ? "auto" : "32px",
        px: isDisplayingCount ? 1.5 : "unset",
        height: "32px",
        borderRadius: isDisplayingCount ? 4 : "100%",
        backgroundColor: theme.palette.blue[70],
        [`.${svgIconClasses.root}`]: {
          color: isDisplayingCount
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
          borderRadius: isDisplayingCount ? 10 : "100%",
        },
      })}
    >
      {icon}
      {isDisplayingCount && (
        <>
          <Typography
            sx={(theme) => ({
              fontSize: 14,
              fontWeight: 600,
              lineHeight: theme.spacing(2),
              color: "purple",
            })}
            ml={0.75}
          >
            {count}
          </Typography>
          <Box
            className="circle"
            sx={(theme) => ({
              position: "absolute",
              backgroundColor: theme.palette.blue[70],
              width: 8,
              height: 8,
              borderRadius: "50%",
              top: 0,
              right: 0,
            })}
          />
        </>
      )}
    </HeaderIconButton>
  );
};
