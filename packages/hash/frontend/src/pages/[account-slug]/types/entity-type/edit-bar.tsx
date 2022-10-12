import { faSmile } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@hashintel/hash-design-system/fontawesome-icon";
import { Box, Collapse, Container, Stack, Typography } from "@mui/material";
import { ReactNode, useState } from "react";
import { useFormContext } from "react-hook-form";
import { PencilSimpleLine } from "../../../../shared/icons/svg";
import { Button, ButtonProps } from "../../../../shared/ui/button";
import { EntityTypeEditorForm } from "./form-types";

// @todo disabled button styles – do this
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
  const {
    formState: { isSubmitting },
  } = useFormContext<EntityTypeEditorForm>();

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
          disabled={isSubmitting}
          {...discardButtonProps}
        >
          {discardButtonProps.children}
        </Button>
        <Button
          variant="secondary"
          size="xs"
          type="submit"
          loading={isSubmitting}
          loadingWithoutText
          disabled={isSubmitting}
          {...confirmButtonProps}
        >
          {confirmButtonProps.children}
        </Button>
      </Stack>
    </Container>
  );
};

export const EditBar = ({
  currentVersion,
  onDiscardChanges,
}: {
  currentVersion: number;
  onDiscardChanges: () => void;
}) => {
  const {
    formState: { isDirty },
  } = useFormContext<EntityTypeEditorForm>();

  const [versionNumberToDisplay, setVersionNumberToDisplay] =
    useState(currentVersion);

  if (isDirty && currentVersion !== versionNumberToDisplay) {
    setVersionNumberToDisplay(currentVersion);
  }

  return (
    <Collapse in={isDirty}>
      <Box
        sx={(theme) => ({
          height: 66,
          backgroundColor: theme.palette.blue[70],
          color: theme.palette.white,
          display: "flex",
          alignItems: "center",
        })}
      >
        {currentVersion === 0 ? (
          <EditBarContents
            icon={<FontAwesomeIcon icon={faSmile} sx={{ fontSize: 14 }} />}
            title="Currently editing"
            label="- this type has not yet been created"
            discardButtonProps={{
              // @todo implement this – do this
              href: "#",
              children: "Discard this type",
            }}
            confirmButtonProps={{
              children: "Create",
            }}
          />
        ) : (
          <EditBarContents
            icon={<PencilSimpleLine />}
            title="Currently editing"
            label={`Version ${versionNumberToDisplay} -> ${
              versionNumberToDisplay + 1
            }`}
            discardButtonProps={{
              onClick: onDiscardChanges,
              children: "Discard changes",
            }}
            confirmButtonProps={{
              children: "Publish update",
            }}
          />
        )}
      </Box>
    </Collapse>
  );
};
