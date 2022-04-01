import { useState, FC } from "react";
import { faAdd, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { Box, Typography, Collapse, Tooltip } from "@mui/material";
import { FontAwesomeIcon } from "../../../shared/icons";
import { IconButton, IconButtonProps, Link } from "../../../shared/ui";

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
  const [hovered, setHovered] = useState(false);
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
      data-testid="create-page-btn"
      onClick={endAdornmentProps.onClick}
      {...otherEndAdornmentProps}
      sx={[
        ({ palette }) => ({
          color: palette.gray[40],
          ...(hovered && {
            backgroundColor: palette.gray[30],
            color: palette.gray[80],
          }),
          "&:hover": {
            backgroundColor: palette.gray[40],
            color: palette.gray[80],
          },
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
          borderRadius: "4px",
          py: 1,
          pl: 1.5,
          pr: 0.75,
          mx: 0.5,
          ...(hovered && {
            backgroundColor: palette.gray[20],
          }),
        })}
        onMouseOver={() => setHovered(true)}
        onMouseOut={() => setHovered(false)}
      >
        <Typography
          variant="smallCaps"
          sx={({ palette }) => ({
            mr: 1.4,
            color: palette.gray[50],
          })}
        >
          {title}
        </Typography>
        <IconButton
          size="xs"
          unpadded
          rounded
          sx={({ palette }) => ({
            mr: "auto",
            color: palette.gray[40],
            ...(hovered && {
              color: palette.gray[80],
            }),
            "&:hover": {
              backgroundColor: palette.gray[30],
              color: palette.gray[80],
            },
          })}
          onClick={() => setExpanded((prev) => !prev)}
        >
          <FontAwesomeIcon
            sx={({ transitions }) => ({
              transform: expanded ? `rotate(90deg)` : "none",
              transition: transitions.create("transform"),
            })}
            icon={faChevronRight}
          />
        </IconButton>
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
