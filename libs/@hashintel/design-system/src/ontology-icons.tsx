import type { SvgIconProps } from "@mui/material";
import type { FunctionComponent } from "react";

import { AsteriskRegularIcon } from "./icon-asterisk-regular";
import { BarcodeIcon } from "./icon-barcode";
import { InputPipeIcon } from "./icon-input-pipe";
import { LinkIcon } from "./icon-link";

export const DataTypeIcon: FunctionComponent<SvgIconProps> = ({
  sx,
  ...props
}) => (
  <BarcodeIcon
    sx={[
      ({ palette }) => ({ fill: palette.pink[80] }),
      ...(Array.isArray(sx) ? sx : [sx]),
    ]}
    {...props}
  />
);

export const EntityTypeIcon: FunctionComponent<SvgIconProps> = ({
  sx,
  ...props
}) => (
  <AsteriskRegularIcon
    sx={[
      ({ palette }) => ({ fill: palette.blue[70] }),
      ...(Array.isArray(sx) ? sx : [sx]),
    ]}
    {...props}
  />
);

export const LinkTypeIcon: FunctionComponent<SvgIconProps> = ({
  sx,
  ...props
}) => (
  <LinkIcon
    sx={[
      ({ palette }) => ({ stroke: palette.aqua[60] }),
      ...(Array.isArray(sx) ? sx : [sx]),
    ]}
    {...props}
  />
);

export const PropertyTypeIcon: FunctionComponent<SvgIconProps> = ({
  sx,
  ...props
}) => (
  <InputPipeIcon
    sx={[
      ({ palette }) => ({ color: palette.purple[60] }),
      ...(Array.isArray(sx) ? sx : [sx]),
    ]}
    {...props}
  />
);
