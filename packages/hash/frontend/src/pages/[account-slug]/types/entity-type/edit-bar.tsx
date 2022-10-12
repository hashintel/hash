import { faSmile } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@hashintel/hash-design-system/fontawesome-icon";
import { Box, Collapse, Container, Stack, Typography } from "@mui/material";
import { ReactNode, useState } from "react";
import { useFormContext } from "react-hook-form";
import { PencilSimpleLine } from "../../../../shared/icons/svg";
import { Button, ButtonProps } from "../../../../shared/ui/button";
import { EntityTypeEditorForm } from "./form-types";

const useFrozenValue = <T extends any>(value: T): T => {
  const {
    formState: { isDirty },
  } = useFormContext<EntityTypeEditorForm>();

  const [frozen, setFrozen] = useState(value);

  if (isDirty && frozen !== value) {
    setFrozen(value);
  }

  return frozen;
};

// @todo disabled button styles
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

  const frozenSubmitting = useFrozenValue(isSubmitting);

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
          disabled={frozenSubmitting}
          {...discardButtonProps}
        >
          {discardButtonProps.children}
        </Button>
        <Button
          variant="secondary"
          size="xs"
          type="submit"
          loading={frozenSubmitting}
          loadingWithoutText
          disabled={frozenSubmitting}
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

  const frozenVersion = useFrozenValue(currentVersion);

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
              // @todo implement this
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
            label={`Version ${frozenVersion} -> ${frozenVersion + 1}`}
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
