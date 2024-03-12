import {
  Box,
  BoxProps,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { FunctionComponent } from "react";

import { ArrowLeftRegularIcon } from "../../components/icons/arrow-left-regular-icon";
import { ArrowRightRegularIcon } from "../../components/icons/arrow-right-regular-icon";
import { Link } from "../../components/link";
import { SiteMapPage } from "../shared/sitemap";

/** @todo: make use of styled component when `FaIcon` component has been replaced */
const navArrowIconStyling: BoxProps["sx"] = {
  color: ({ palette }) => palette.teal[80],
  fontSize: 15,
  marginTop: 0.8,
  position: "relative",
  left: 0,
  transition: ({ transitions }) => transitions.create("left"),
};

type PageNavLinksProps = {
  prevPage?: SiteMapPage;
  nextPage?: SiteMapPage;
} & BoxProps;

export const PageNavLinks: FunctionComponent<PageNavLinksProps> = ({
  prevPage,
  nextPage,
  ...boxProps
}) => {
  const theme = useTheme();
  const hideIcons = useMediaQuery(theme.breakpoints.down(1200));

  return (
    <Box display="flex" justifyContent="space-between" {...boxProps}>
      <Box>
        {prevPage && (
          <Box display="flex" alignItems="flex-end">
            <Box>
              <Typography sx={{ color: theme.palette.gray[50] }} component="p">
                Previous
              </Typography>
              <Box
                display="flex"
                sx={{
                  marginLeft: hideIcons ? 0 : "-31px",
                  "& svg": {
                    display: hideIcons ? "none" : "inherit",
                  },
                  "&:hover": {
                    color: theme.palette.teal[80],
                    "& svg": {
                      left: `-${theme.spacing(1)}`,
                    },
                  },
                }}
              >
                <ArrowLeftRegularIcon
                  sx={[
                    {
                      marginRight: 2,
                    },
                    navArrowIconStyling,
                  ]}
                />
                <Link
                  sx={{
                    maxWidth: hideIcons ? 150 : 200,
                  }}
                  href={prevPage.href}
                >
                  {prevPage.title}
                </Link>
              </Box>
            </Box>
          </Box>
        )}
      </Box>
      <Box>
        {nextPage && (
          <Box display="flex" flexDirection="column" alignItems="flex-end">
            <Typography sx={{ color: theme.palette.gray[50] }} component="p">
              Next
            </Typography>
            <Box
              display="flex"
              sx={{
                marginRight: hideIcons ? 0 : "-31px",
                "& svg": {
                  display: hideIcons ? "none" : "inherit",
                },
                "&:hover": {
                  color: theme.palette.teal[80],
                  "& svg": {
                    left: theme.spacing(1),
                  },
                },
              }}
            >
              <Link
                sx={{
                  textAlign: "right",
                  maxWidth: hideIcons ? 150 : 200,
                }}
                href={nextPage.href}
              >
                {nextPage.title}
              </Link>
              <ArrowRightRegularIcon
                sx={[
                  {
                    marginLeft: 2,
                  },
                  navArrowIconStyling,
                ]}
              />
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
};
