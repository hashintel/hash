import {
  faArrowRight,
  faArrowsLeftRight,
  faBullhorn,
} from "@fortawesome/free-solid-svg-icons";
import { Box, Container, Typography } from "@mui/material";

import { FontAwesomeIcon } from "./icons/FontAwesomeIcon";
import { Link } from "./Link";

const CAREERS_SITE = "https://hash.ai/careers";

export const HiringBanner = () => {
  return (
    <Link href={CAREERS_SITE} target="_blank" rel="noopener">
      <Box
        sx={({ transitions }) => ({
          position: "relative",
          py: 3.25,
          transition: transitions.create("opacity"),
          cursor: "pointer",
          /** background */
          background: {
            xs: "linear-gradient(96.49deg, #599dfc -20%, #664df2 40%)",
            lg: "linear-gradient(90.78deg, #5bc5fd -15%, #4e7cf9 25%, #664df2 100%)",
          },
          "&:after": {
            content: "''",
            position: "absolute",
            top: 0,
            left: 0,
            height: "100%",
            width: "100%",
            /** background on hover */
            background: {
              xs: "linear-gradient(96.49deg, #4a91f5 -20%, #583eee 40%)",
              lg: "linear-gradient(90.78deg, #53c3ff -15%, #4a91f5 25%, #583eee 100%)",
            },
            opacity: 0,
            transition: transitions.create("opacity"),
          },

          "&:hover:after": {
            opacity: 1,
          },
        })}
      >
        <Container
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            zIndex: 2,
          }}
        >
          <Box
            sx={{
              height: 32,
              width: 32,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              alignSelf: { xs: "flex-start", lg: "center" },
              backgroundColor: "#F0F9FF",
              color: "#4d6aff",
              mr: 2,
              flexShrink: 0,
            }}
          >
            <FontAwesomeIcon icon={faBullhorn} />
          </Box>

          <Box display="flex" alignItems="center" flexWrap="wrap">
            <Typography
              variant="hashSmallText"
              sx={{
                color: "#eeeffa",
                fontWeight: "medium",
                mr: { xs: 0, lg: 1.5 },
                mb: { xs: 1.5, lg: 0 },
              }}
            >
              <Box component="span" mr="0.5ch">
                We're hiring full-stack TypeScript/React and PHP plugin
                developers to help grow the
              </Box>
              <Box component="span" display="inline-flex" alignItems="center">
                Block Protocol
                <FontAwesomeIcon
                  icon={faArrowsLeftRight}
                  sx={{ fontSize: "inherit", mx: "0.5ch" }}
                />
                WordPress ecosystem.
              </Box>
            </Typography>
            <Typography
              component="span"
              variant="hashSmallText"
              color="currentcolor"
              sx={({ palette }) => ({
                fontWeight: 700,
                color: palette.gray[10],
                lineHeight: 1.1,
                display: { xs: "flex", lg: "inline-flex" },
                width: "content",
                alignItems: "center",
                borderBottom: "1px solid currentColor",
                "&:hover": {
                  color: palette.gray[30],
                },
              })}
            >
              Learn more
              <FontAwesomeIcon
                icon={faArrowRight}
                sx={{ ml: 0.5, fontSize: 14 }}
              />
            </Typography>
          </Box>
        </Container>
      </Box>
    </Link>
  );
};
