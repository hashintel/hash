import { useState, FC, ReactNode } from "react";
import { faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { Box, Typography, Collapse } from "@mui/material";
import { FontAwesomeIcon } from "../../icons";
import { IconButton } from "../../IconButton";
// import { Link } from "./Link";

type NavLinkProps = {
  title: string;
  endAdornment: ReactNode;
};

export const NavLink: FC<NavLinkProps> = ({
  title,
  children,
  endAdornment,
}) => {
  const [expanded, setExpanded] = useState(true);

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          py: "9px",
          pl: "18px",
          pr: 0.5,
          mx: 0.5,
        }}
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

        {endAdornment}
      </Box>
      <Collapse in={expanded}>{children}</Collapse>
    </Box>
  );
};
