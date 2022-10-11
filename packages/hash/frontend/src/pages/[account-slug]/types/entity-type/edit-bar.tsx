import { faSmile } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@hashintel/hash-design-system/fontawesome-icon";
import { Box, Container, Stack, Typography } from "@mui/material";
import { ReactNode } from "react";
import { PencilSimpleLine } from "../../../../shared/icons/svg";
import { Button, ButtonProps } from "../../../../shared/ui/button";

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
}) => (
  <Container
    sx={{
      display: "flex",
      alignItems: "center",
    }}
  >
    {icon}
    <Typography variant="smallText" sx={{ ml: 1 }}>
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
      <Button variant="secondary" size="xs" {...confirmButtonProps}>
        {confirmButtonProps.children}
      </Button>
    </Stack>
  </Container>
);

export const EditBar = ({ currentVersion }: { currentVersion: number }) => (
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
          href: "#",
          children: "Discard this type",
        }}
        confirmButtonProps={{
          onClick() {
            // @todo implement
          },
          children: "Create",
        }}
      />
    ) : (
      <EditBarContents
        icon={<PencilSimpleLine />}
        title="Currently editing"
        label={`Version ${currentVersion} -> ${currentVersion + 1}`}
        discardButtonProps={{
          // @todo revert back
          href: "#",
          children: "Discard changes",
        }}
        confirmButtonProps={{
          onClick() {
            // @todo implement
          },
          children: "Publish update",
        }}
      />
    )}
  </Box>
);
