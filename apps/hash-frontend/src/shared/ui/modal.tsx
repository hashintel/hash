import type {
  IconButton,
  Modal as BaseModal,
  ModalProps,
} from "@hashintel/design-system";
import type { Box, Stack, SxProps, Theme, Typography } from "@mui/material";

import { XMarkRegularIcon } from "../icons/x-mark-regular-icon";

export const Modal = ({
  sx,
  header,
  children,
  ...props
}: ModalProps & {
  header?: {
    hideBorder?: boolean;
    hideCloseButton?: boolean;
    subtitle?: string;
    sx?: SxProps<Theme>;
    title?: string;
  };
}) => (
  <BaseModal
    sx={[
      ({ palette }) => ({
        p: "0px !important",
        border: 1,
        borderColor: palette.gray[20],
      }),
      ...(Array.isArray(sx) ? sx : [sx]),
    ]}
    {...props}
  >
    <>
      {header && (
        <Stack
          alignItems={header.subtitle ? "flex-start" : "center"}
          direction={"row"}
          justifyContent={"space-between"}
          sx={[
            {
              borderBottom: header.hideBorder
                ? "none"
                : ({ palette }) => `1px solid ${palette.gray[20]}`,
              py: header.subtitle ? 1.5 : 1,
              pl: 2.5,
              pr: 1,
            },
            ...(Array.isArray(header.sx) ? header.sx : [header.sx]),
          ]}
        >
          <Box>
            {header.title && (
              <Typography
                gutterBottom={Boolean(header.subtitle)}
                sx={{
                  fontWeight: 500,
                  color: ({ palette }) => palette.gray[80],
                }}
              >
                {header.title}
              </Typography>
            )}
            {header.subtitle && (
              <Typography
                sx={{
                  fontSize: 14,
                  color: ({ palette }) => palette.gray[80],
                }}
              >
                {header.subtitle}
              </Typography>
            )}
          </Box>

          {!header.hideCloseButton && props.onClose && (
            <IconButton
              aria-label={"Cancel"}
              sx={{ "& svg": { fontSize: 20 } }}
              onClick={(event) => props.onClose?.(event, "escapeKeyDown")}
            >
              <XMarkRegularIcon />
            </IconButton>
          )}
        </Stack>
      )}
      {children}
    </>
  </BaseModal>
);
