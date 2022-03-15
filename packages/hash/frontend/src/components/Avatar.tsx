import { VFC } from "react";
import { Box, BoxProps } from "@mui/material";

interface AvatarProps extends BoxProps {
  title: string;
  size?: number;
}

export const Avatar: VFC<AvatarProps> = ({ title, size = 32, ...props }) => {
  const { sx, ...otherProps } = props;
  return (
    <Box
      sx={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "50%",
        backgroundColor: ({ palette }) => palette.blue[70],
        ...sx,
      }}
      {...otherProps}
    >
      <Box
        component="span"
        sx={{
          color: ({ palette }) => palette.common.white,
          fontSize: size / 2,
          lineHeight: 1,
        }}
      >
        {(title || "User").charAt(0).toUpperCase()}
      </Box>
    </Box>
  );
};
