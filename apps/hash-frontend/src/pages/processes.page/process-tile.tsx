import { Box, Typography } from "@mui/material";

import { Link } from "../../shared/ui/link";
import { PetriNetPreview } from "./petri-net-preview";

import type { SDCPN } from "@hashintel/petrinaut";

/**
 * Card UI used for each entry in the `/processes` list. The card body shows
 * a small SVG preview of the net, and the strip at the bottom shows the
 * process title.
 */
export const ProcessTile = ({
  href,
  sdcpn,
  title,
}: {
  href: string;
  sdcpn: SDCPN;
  title: string;
}) => (
  <Link
    href={href}
    noLinkStyle
    sx={({ palette, transitions }) => ({
      backgroundColor: palette.common.white,
      border: `1px solid ${palette.gray[20]}`,
      borderRadius: 1.5,
      color: "inherit",
      display: "flex",
      flexDirection: "column",
      height: 200,
      overflow: "hidden",
      textDecoration: "none",
      transition: transitions.create(["border-color", "box-shadow"]),
      "&:hover": {
        borderColor: palette.gray[40],
        boxShadow:
          "0px 4px 12px rgba(0, 0, 0, 0.08), 0px 2px 4px rgba(0, 0, 0, 0.04)",
      },
    })}
  >
    <Box
      sx={({ palette }) => ({
        alignItems: "center",
        backgroundColor: palette.common.white,
        borderBottom: `1px solid ${palette.gray[15]}`,
        display: "flex",
        flex: 1,
        justifyContent: "center",
        minHeight: 0,
        overflow: "hidden",
        p: 2,
      })}
    >
      <PetriNetPreview sdcpn={sdcpn} />
    </Box>
    <Box
      sx={{
        alignItems: "center",
        display: "flex",
        justifyContent: "space-between",
        px: 2,
        py: 1.5,
      }}
    >
      <Typography
        sx={{
          fontSize: 14,
          fontWeight: 500,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {title}
      </Typography>
    </Box>
  </Link>
);
