import { ButtonBase } from "@mui/material";

import { Icon } from "@hashintel/ds-components";

type DeleteIconButtonProps = {
  label: string;
  onClick?: () => void;
};

/**
 * Small square delete button shared by dashboard cards and configuration
 * builders: neutral at rest, then red with a light red background on hover.
 */
export const DeleteIconButton = ({ label, onClick }: DeleteIconButtonProps) => (
  <ButtonBase
    onClick={onClick}
    aria-label={label}
    title={label}
    sx={{
      width: 24,
      height: 24,
      borderRadius: "6px",
      color: "#838383",
      flexShrink: 0,
      transition: "color 0.1s ease, background-color 0.1s ease",
      "&:hover": {
        color: "#e5484d",
        backgroundColor: "rgba(229, 72, 77, 0.1)",
      },
    }}
  >
    <Icon name="trash" size="xs" />
  </ButtonBase>
);
