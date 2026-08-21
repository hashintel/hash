import {
  Box,
  Collapse,
  Container,
  Stack,
  styled,
  Typography,
} from "@mui/material";
import { type ReactNode } from "react";

import { Button } from "../../../shared/ui/button";

import type { ButtonProps } from "../../../shared/ui/button";

export const EditBarContents = ({
  hideConfirm,
  hideDiscard,
  icon,
  title,
  label,
  discardButtonProps: { sx: discardSx, ...discardButtonProps },
  confirmButtonProps,
}: {
  hideConfirm?: boolean;
  hideDiscard?: boolean;
  icon: ReactNode;
  title: ReactNode;
  label: ReactNode;
  discardButtonProps: ButtonProps;
  confirmButtonProps: ButtonProps;
}) => {
  if (hideDiscard && hideConfirm) {
    throw new Error("hideDiscard and hideConfirm cannot both be true");
  }

  return (
    <Container
      sx={{
        display: "flex",
        alignItems: "center",
        "& svg": { fontSize: 16 },
      }}
    >
      {icon}
      <Typography variant="smallTextLabels" sx={{ ml: 1 }}>
        <Box component="span" sx={{ fontWeight: "bold" }}>
          {title}
        </Box>{" "}
        {label}
      </Typography>
      <Stack spacing={1.25} sx={{ marginLeft: "auto" }} direction="row">
        {!hideDiscard && (
          <Button
            variant="tertiary"
            size="xs"
            sx={[
              (theme) => ({
                borderColor: theme.palette.blue[50],
                backgroundColor: "transparent",
                color: "white",
                "&:hover": {
                  backgroundColor: theme.palette.blue[80],
                  color: "white",
                },
              }),
              ...(Array.isArray(discardSx) ? discardSx : [discardSx]),
            ]}
            {...discardButtonProps}
          >
            {discardButtonProps.children}
          </Button>
        )}
        {!hideConfirm && (
          <Button
            variant="secondary"
            size="xs"
            type="submit"
            loadingWithoutText
            data-testid="editbar-confirm"
            {...confirmButtonProps}
          >
            {confirmButtonProps.children}
          </Button>
        )}
      </Stack>
    </Container>
  );
};

/**
 * THIS MUST BE KEPT IN SYNC WITH EDIT_BAR_HEIGHT IN @hashintel/type-editor
 * @todo make this a prop / shared some other way
 */
export const EDIT_BAR_HEIGHT = 50;

export const EditBarContainer = styled(Box, {
  shouldForwardProp: (prop) =>
    prop !== "hasErrors" && prop !== "gentleErrorStyling",
})<{ hasErrors?: boolean; gentleErrorStyling?: boolean }>(
  ({ hasErrors, theme, gentleErrorStyling }) => ({
    height: EDIT_BAR_HEIGHT,
    backgroundColor: gentleErrorStyling
      ? theme.palette.gray[5]
      : hasErrors
        ? theme.palette.red[70]
        : theme.palette.blue[70],
    color: gentleErrorStyling ? theme.palette.gray[60] : theme.palette.white,
    display: "flex",
    alignItems: "center",
    transition: "background-color 0.1s ease-in-out, color 0.1s ease-in-out",
  }),
);

export const EditBarCollapse = styled(Collapse)(({ theme }) => ({
  position: "sticky",
  top: 0,
  // Above table sticky footers
  zIndex: theme.zIndex.drawer + 2,
}));
