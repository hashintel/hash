import { Box, Typography } from "@mui/material";
import { bindTrigger } from "material-ui-popup-state/hooks";

import { CaretDownSolidIcon, Chip } from "@hashintel/design-system";

import { activePillSx, defaultPillSx } from "./pill-styles";

import type { SvgIconProps } from "@mui/material";
import type { PopupState } from "material-ui-popup-state/hooks";
import type { ComponentType, FunctionComponent } from "react";

type FilterPillProps = {
  icon: ComponentType<SvgIconProps>;
  prefix: string;
  value: string;
  active: boolean;
  popupState: PopupState;
};

export const FilterPill: FunctionComponent<FilterPillProps> = ({
  icon: Icon,
  prefix,
  value,
  active,
  popupState,
}) => (
  <Chip
    icon={
      <Icon
        sx={{
          fill: ({ palette }) =>
            active ? palette.blue[70] : palette.primary.main,
        }}
      />
    }
    label={
      <Box
        component="span"
        sx={{ display: "inline-flex", alignItems: "center", gap: 0.6 }}
      >
        <Typography
          component="span"
          sx={{
            fontSize: 13,
            fontWeight: 400,
            color: ({ palette }) =>
              active ? palette.blue[70] : palette.gray[60],
          }}
        >
          {prefix}
        </Typography>
        <Typography
          component="span"
          sx={{
            fontSize: 13,
            fontWeight: 600,
            color: ({ palette }) =>
              active ? palette.blue[90] : palette.gray[80],
          }}
        >
          {value}
        </Typography>
        <CaretDownSolidIcon
          sx={{
            fontSize: 12,
            transform: `rotate(${popupState.isOpen ? 180 : 0}deg)`,
          }}
        />
      </Box>
    }
    sx={active ? activePillSx : defaultPillSx}
    {...bindTrigger(popupState)}
  />
);
