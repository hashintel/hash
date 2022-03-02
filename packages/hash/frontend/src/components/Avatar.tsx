import { VFC } from "react";
import { Box } from "@mui/material";

interface AvatarProps {
  title: string;
  size?: number;
}

export const Avatar: VFC<AvatarProps> = ({ title, size = 32 }) => {
  return (
    <Box
      display="flex"
      alignItems="center"
      justifyContent="center"
      sx={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "50%",
        backgroundColor: ({ palette }) => palette.blue[70],
      }}
    >
      <Box
        component="span"
        sx={{
          color: ({ palette }) => palette.common.white,
          fontSize: size / 2,
          lineHeight: 1,
        }}
      >
        {title?.charAt(0).toUpperCase() ?? "U"}
      </Box>
    </Box>
  );
};
