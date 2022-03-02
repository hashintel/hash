import { useState } from "react";
import { faAdd, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { Box, IconButton, Typography, Collapse, Tooltip } from "@mui/material";
import { FontAwesomeSvgIcon } from "../../icons";
// import { Link } from "./Link";

export const NavLink = ({ title, children, addButtonTooltip }) => {
  const [visible, setVisible] = useState(false);

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
          sx={{
            mr: "auto",
          }}
          onClick={() => setVisible((prev) => !prev)}
        >
          <FontAwesomeSvgIcon
            sx={{
              color: ({ palette }) => palette.gray[40],
              transform: visible ? `rotate(90deg)` : "none",
              transition: ({ transitions }) =>
                transitions.create("transform", { duration: 300 }),
            }}
            icon={faChevronRight}
          />
        </IconButton>

        <Tooltip title={addButtonTooltip}>
          <IconButton>
            <FontAwesomeSvgIcon
              icon={faAdd}
              sx={{ fontSize: 12, color: ({ palette }) => palette.gray[40] }}
            />
          </IconButton>
        </Tooltip>
      </Box>
      <Collapse in={visible}>{children}</Collapse>
    </Box>
  );
};
