import { useState, FC } from "react";
import { faAdd, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { Box, Typography, Collapse, Tooltip } from "@mui/material";
import {
  IconButton,
  IconButtonProps,
  FontAwesomeIcon,
} from "@hashintel/hash-design-system";
import { Link } from "../../ui";

type NavLinkProps = {
  title: string;
  endAdornmentProps: {
    tooltipTitle: string;
    "data-testid"?: string;
    href?: string;
  } & IconButtonProps;
};

export const NavLink: FC<NavLinkProps> = ({
  title,
  children,
  endAdornmentProps,
}) => {
  const [expanded, setExpanded] = useState(true);
  const {
    tooltipTitle: endAdornmentTooltipTitle,
    sx: endAdormentSx = [],
    href: endAdornmentHref,
    ...otherEndAdornmentProps
  } = endAdornmentProps;

  const endAdornment = (
    <IconButton
      size="small"
      unpadded
      rounded
      className="end-adornment-button"
      onClick={endAdornmentProps.onClick}
      {...otherEndAdornmentProps}
      sx={[
        ({ palette }) => ({
          color: palette.gray[40],
        }),
        ...(Array.isArray(endAdormentSx) ? endAdormentSx : [endAdormentSx]),
      ]}
    >
      <FontAwesomeIcon icon={faAdd} />
    </IconButton>
  );

  return (
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
            backgroundColor: palette.gray[20],
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
          onClick={() => setExpanded((prev) => !prev)}
        >
          <Typography
            variant="smallCaps"
            sx={({ palette }) => ({
              mr: 0.5,
              color: palette.gray[50],
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
              color: palette.gray[40],
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
        <Tooltip title={endAdornmentTooltipTitle}>
          {endAdornmentHref ? (
            <Link tabIndex={-1} href={endAdornmentHref} noLinkStyle>
              {endAdornment}
            </Link>
          ) : (
            endAdornment
          )}
        </Tooltip>
      </Box>
      <Collapse in={expanded}>{children}</Collapse>
    </Box>
  );
};
