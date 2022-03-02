import { VFC } from "react";
import { Box, Typography } from "@mui/material";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeSvgIcon } from "../../icons";

type WorkspaceSwitcherProps = {};

export const WorkspaceSwitcher: VFC<WorkspaceSwitcherProps> = () => {
  return (
    <Box
      sx={{
        borderRadius: "4px",
        display: "flex",
        alignItems: "center",
        padding: "12px 16px 12px 28px",
        "&:hover": {
          backgroundColor: ({ palette }) => palette.gray[20],
        },
      }}
    >
      <Box
        sx={{
          height: 32,
          width: 32,
          backgroundColor: ({ palette }) => palette.blue[70],
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          mr: 1,
        }}
      >
        <Typography sx={{ color: ({ palette }) => palette.common.white }}>
          M
        </Typography>
      </Box>
      <Typography
        sx={{
          mr: 1,
          overflowX: "hidden",
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
        }}
      >
        The Long Company is Here
      </Typography>
      <FontAwesomeSvgIcon icon={faChevronDown} sx={{ fontSize: 12 }} />
    </Box>
  );
};
