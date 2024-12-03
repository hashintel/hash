import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const IconDiagramNestedLight: FunctionComponent<SvgIconProps> = ({
  sx = [],
  ...props
}) => {
  return (
    <SvgIcon
      {...props}
      width="448"
      height="512"
      viewBox="0 0 448 512"
      fill="none"
      sx={Array.isArray(sx) ? sx : [sx]}
    >
      <path d="M144 64c8.8 0 16 7.2 16 16l0 96c0 8.8-7.2 16-16 16l-32 0-32 0-32 0c-8.8 0-16-7.2-16-16l0-96c0-8.8 7.2-16 16-16l96 0zM112 224l32 0c26.5 0 48-21.5 48-48l0-96c0-26.5-21.5-48-48-48L48 32C21.5 32 0 53.5 0 80l0 96c0 26.5 21.5 48 48 48l32 0 0 96c0 44.2 35.8 80 80 80l96 0 0 32c0 26.5 21.5 48 48 48l96 0c26.5 0 48-21.5 48-48l0-96c0-26.5-21.5-48-48-48l-96 0c-26.5 0-48 21.5-48 48l0 32-96 0c-26.5 0-48-21.5-48-48l0-96zM288 368l0-32c0-8.8 7.2-16 16-16l96 0c8.8 0 16 7.2 16 16l0 96c0 8.8-7.2 16-16 16l-96 0c-8.8 0-16-7.2-16-16l0-32 0-32z" />
    </SvgIcon>
  );
};
