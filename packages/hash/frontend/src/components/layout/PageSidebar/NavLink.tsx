import { useState, FC } from "react";
import { faAdd, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { Box, Typography, Collapse, Tooltip } from "@mui/material";
import { FontAwesomeIcon } from "../../icons";
import { IconButton, IconButtonProps } from "../../IconButton";
// import { Link } from "./Link";

type NavLinkProps = {
  title: string;
  endAdornmentProps: {
    tooltipTitle: string;
    "data-testid"?: string;
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
    sx: endAdormentSx,
    ...otherEndAdornmentProps
  } = endAdornmentProps;

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          borderRadius: "4px",
          py: "8px",
          pl: "12px",
          pr: "6px",
          mx: 0.5,
          ...(hovered && {
            backgroundColor: ({ palette }) => palette.gray[20],
          }),
        }}
        onMouseOver={() => setHovered(true)}
        onMouseOut={() => setHovered(false)}
      >
        <Typography
          variant="smallCaps"
          sx={{
            mr: 1.4,
            color: ({ palette }) => palette.gray[50],
          }}
        >
          {title}
        </Typography>
        <IconButton
          size="small"
          unpadded
          rounded
          sx={{
            mr: "auto",
            ...(!expanded && { color: ({ palette }) => palette.gray[40] }),
            ...(hovered && {
              backgroundColor: ({ palette }) => palette.gray[30],
              color: ({ palette }) => palette.gray[80],
            }),
          }}
          onClick={() => setExpanded((prev) => !prev)}
        >
          <FontAwesomeIcon
            sx={{
              transform: expanded ? `rotate(90deg)` : "none",
              transition: ({ transitions }) =>
                transitions.create("transform", { duration: 300 }),
            }}
            icon={faChevronRight}
          />
        </IconButton>

        {/* endAdornment */}
        <Tooltip title={endAdornmentTooltipTitle}>
          <IconButton
            size="small"
            unpadded
            rounded
            data-testid="create-page-btn"
            onClick={endAdornmentProps.onClick}
            {...otherEndAdornmentProps}
            sx={{
              ...(hovered && {
                backgroundColor: ({ palette }) => palette.gray[30],
                color: ({ palette }) => palette.gray[80],
              }),
              ...endAdormentSx,
            }}
          >
            <FontAwesomeIcon icon={faAdd} />
          </IconButton>
        </Tooltip>
      </Box>
      <Collapse in={expanded}>{children}</Collapse>
    </Box>
  );
};
