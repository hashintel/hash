import { faChevronRight } from "@fortawesome/free-solid-svg-icons";
import {
  FontAwesomeIcon,
  IconButton,
  LoadingSpinner,
} from "@hashintel/design-system";
import { Box, Collapse, Typography } from "@mui/material";
import type { FunctionComponent, ReactNode } from "react";

type NavLinkProps = {
  children?: ReactNode;
  title: string;
  loading?: boolean;
  endAdornment?: ReactNode;
  expanded: boolean;
  toggleExpanded: () => void;
};

export const NavLink: FunctionComponent<NavLinkProps> = ({
  title,
  children,
  loading = false,
  endAdornment,
  expanded,
  toggleExpanded,
}) => (
  <Box>
    <Box
      sx={({ palette }) => ({
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        mx: 0.75,
        mt: 2,
        "&:hover": {
          cursor: "pointer",
          backgroundColor: palette.gray[15],
          "& .expand-button": {
            color: palette.gray[60],

            "&:hover": {
              backgroundColor: palette.gray[30],
              color: palette.gray[80],
            },
          },
        },
      })}
    >
      <Box
        sx={{
          display: "flex",
          width: "100%",
          alignItems: "center",
          borderRadius: "4px",
          py: 0.5,
          pl: 1.5,
          pr: 0.75,
        }}
        onClick={toggleExpanded}
      >
        <Typography
          variant="smallCaps"
          sx={({ palette }) => ({
            mr: 0.5,
            color: palette.gray[70],
          })}
        >
          {title}
        </Typography>

        <IconButton
          size="xs"
          unpadded
          rounded
          className="expand-button"
          sx={({ palette }) => ({
            mr: "auto",
            color: palette.gray[70],
          })}
        >
          <FontAwesomeIcon
            sx={({ transitions }) => ({
              transform: expanded ? `rotate(90deg)` : "none",
              transition: transitions.create("transform"),
            })}
            icon={faChevronRight}
          />
        </IconButton>
      </Box>

      <Box
        sx={({ transitions }) => ({
          transition: transitions.create("opacity"),
          opacity: loading ? 1 : 0,
          marginRight: 1,
        })}
      >
        <LoadingSpinner size={12} thickness={2} />
      </Box>
      {endAdornment}
      {/* <Tooltip title={endAdornmentTooltipTitle}>
          {endAdornmentHref ? (
            <Link tabIndex={-1} href={endAdornmentHref} noLinkStyle>
              {endAdornment}
            </Link>
          ) : (
            endAdornment
          )}
        </Tooltip> */}
    </Box>
    <Collapse in={expanded}>{children}</Collapse>
  </Box>
);
