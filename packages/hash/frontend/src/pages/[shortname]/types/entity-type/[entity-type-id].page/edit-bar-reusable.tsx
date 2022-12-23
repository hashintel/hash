import { Box, Collapse, Container, Stack, Typography } from "@mui/material";
import { ReactNode } from "react";
import { PencilSimpleLine } from "../../../../../shared/icons/svg";
import { Button, ButtonProps } from "../../../../../shared/ui/button";
import { useFreezeScrollWhileTransitioning } from "./edit-bar";

const EditBarContents = ({
  icon,
  title,
  label,
  discardButtonProps,
  confirmButtonProps,
}: {
  icon: ReactNode;
  title: ReactNode;
  label: ReactNode;
  discardButtonProps: ButtonProps;
  confirmButtonProps: ButtonProps;
}) => {
  return (
    <Container
      sx={{
        display: "flex",
        alignItems: "center",
      }}
    >
      {icon}
      <Typography variant="smallTextLabels" sx={{ ml: 1 }}>
        <Box component="span" sx={{ fontWeight: "bold", mr: 1 }}>
          {title}
        </Box>{" "}
        {label}
      </Typography>
      <Stack spacing={1.25} sx={{ marginLeft: "auto" }} direction="row">
        <Button
          variant="tertiary"
          size="xs"
          sx={(theme) => ({
            borderColor: theme.palette.blue[50],
            backgroundColor: "transparent",
            color: "white",
            "&:hover": {
              backgroundColor: theme.palette.blue[80],
              color: "white",
            },
          })}
          {...discardButtonProps}
        >
          {discardButtonProps.children}
        </Button>
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
      </Stack>
    </Container>
  );
};

/**
 * @todo make this file actually reusable and rename it to "edit-bar",
 * current `edit-bar` is a variant of the edit bar, specific for TypeEditor.
 * refactor the current `edit-bar`, and rename it to something like `type-editor-edit-bar`
 */
export const EditBarReusable = ({
  discardButtonProps,
  confirmButtonProps,
  visible,
  label,
}: {
  visible: boolean;
  discardButtonProps: Partial<ButtonProps>;
  confirmButtonProps: Partial<ButtonProps>;
  label?: ReactNode;
}) => {
  const ref = useFreezeScrollWhileTransitioning();

  return (
    <Collapse in={visible} ref={ref}>
      <Box
        sx={(theme) => ({
          height: 66,
          backgroundColor: theme.palette.blue[70],
          color: theme.palette.white,
          display: "flex",
          alignItems: "center",
        })}
      >
        <EditBarContents
          icon={<PencilSimpleLine />}
          title="Currently editing"
          label={label}
          discardButtonProps={{
            children: "Discard changes",
            ...discardButtonProps,
          }}
          confirmButtonProps={{
            children: "Publish update",
            ...confirmButtonProps,
          }}
        />
      </Box>
    </Collapse>
  );
};
