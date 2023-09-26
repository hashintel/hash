import { Box, BoxProps } from "@mui/material";
import { FunctionComponent } from "react";

interface AvatarProps extends BoxProps {
  title?: string;
  size?: number;
  src?: string;
}

export const Avatar: FunctionComponent<AvatarProps> = ({
  title,
  size = 20,
  src,
  ...props
}) => {
  const { sx = [], bgcolor, ...otherProps } = props;
  return (
    <Box
      sx={[
        {
          width: size,
          height: size,
          display: "flex",
          ...(!src && {
            alignItems: "center",
            justifyContent: "center",
          }),
          background:
            bgcolor ?? src ? undefined : ({ palette }) => palette.blue[70],
          borderRadius: "50%",
          border: ({ palette }) => `1px solid ${palette.gray[20]}`,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      {...otherProps}
    >
      {src ? (
        <Box
          component="img"
          src={src}
          sx={{
            height: "100%",
            width: "100%",
            objectFit: "cover",
            borderRadius: "50%",
          }}
        />
      ) : (
        <Box
          component="span"
          sx={{
            color: ({ palette }) => palette.common.white,
            fontSize: size / 2,
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          {title ? title.charAt(0).toUpperCase() : undefined}
        </Box>
      )}
    </Box>
  );
};
