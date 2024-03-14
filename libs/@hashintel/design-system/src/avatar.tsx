import type { BoxProps } from "@mui/material";
import { Box, styled } from "@mui/material";
import type { FunctionComponent } from "react";

import { IconButton } from "./icon-button";
import { PenRegularIcon } from "./pen-regular-icon";

const EditEmojiIconButton = styled(IconButton)(({ theme }) => ({
  background: theme.palette.common.white,
  padding: theme.spacing(0.5),
  borderColor: theme.palette.gray[30],
  borderWidth: 1,
  borderStyle: "solid",
}));

interface AvatarProps extends BoxProps {
  title?: string;
  size?: number;
  src?: string;
  onEditEmojiIconButtonDisabled?: boolean;
  onEditEmojiIconButtonClick?: () => void;
  borderRadius?: number | string;
}

export const Avatar: FunctionComponent<AvatarProps> = ({
  title,
  size = 20,
  src,
  onEditEmojiIconButtonDisabled,
  onEditEmojiIconButtonClick,
  borderRadius = "50%",
  ...props
}) => {
  const { sx = [], bgcolor, ...otherProps } = props;
  return (
    <Box
      sx={[
        {
          position: "relative",
          width: size,
          height: size,
          display: "flex",
          ...(!src && {
            alignItems: "center",
            justifyContent: "center",
          }),
          background:
            bgcolor ?? src ? undefined : ({ palette }) => palette.blue[70],
          borderRadius,
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
            borderRadius,
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
      {onEditEmojiIconButtonClick ? (
        <EditEmojiIconButton
          sx={{
            position: "absolute",
            top: ({ spacing }) => spacing(1),
            right: ({ spacing }) => spacing(1),
          }}
          disabled={onEditEmojiIconButtonDisabled}
          onClick={onEditEmojiIconButtonClick}
        >
          <PenRegularIcon sx={{ fontSize: 13 }} />
        </EditEmojiIconButton>
      ) : null}
    </Box>
  );
};
