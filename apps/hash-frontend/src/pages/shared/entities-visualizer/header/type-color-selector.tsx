import { Box, Popover } from "@mui/material";
import {
  bindPopover,
  bindTrigger,
  usePopupState,
} from "material-ui-popup-state/hooks";

import { typeColorPalette, unassignedTypeColor } from "../shared/type-colors";

import type { VersionedUrl } from "@blockprotocol/type-system";
import type { FunctionComponent, MouseEvent } from "react";

/** The swatch shown in the type row; exported so the row can reserve its space. */
export const triggerSwatchSize = 16;
/** The larger swatches shown in the palette dropdown. */
const optionSwatchSize = 22;

const swatchOptions = [...typeColorPalette, unassignedTypeColor];

type TypeColorSelectorProps = {
  entityTypeId: VersionedUrl;
  color: string;
  onChange: (color: string) => void;
};

/**
 * A small colour swatch that opens a palette popover, letting a type be assigned
 * one of the Brandmark colours (or light grey) in the network graph view.
 */
export const TypeColorSelector: FunctionComponent<TypeColorSelectorProps> = ({
  entityTypeId,
  color,
  onChange,
}) => {
  const popupState = usePopupState({
    variant: "popover",
    popupId: `type-color-${entityTypeId}`,
  });

  const triggerProps = bindTrigger(popupState);

  return (
    <>
      <Box
        component="button"
        type="button"
        aria-label="Select colour"
        {...triggerProps}
        onClick={(event: MouseEvent<HTMLButtonElement>) => {
          // Keep the click from toggling the enclosing type checkbox.
          event.stopPropagation();
          triggerProps.onClick(event);
        }}
        sx={{
          flexShrink: 0,
          width: triggerSwatchSize,
          height: triggerSwatchSize,
          p: 0,
          borderRadius: "50%",
          border: "none",
          backgroundColor: color,
          cursor: "pointer",
        }}
      />
      <Popover
        {...bindPopover(popupState)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        onClick={(event) => event.stopPropagation()}
        slotProps={{
          paper: {
            sx: {
              borderRadius: "12px",
              border: ({ palette }) => `1px solid ${palette.gray[20]}`,
            },
          },
        }}
      >
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(6, auto)",
            gap: 0.75,
            p: 1,
          }}
        >
          {swatchOptions.map((option) => (
            <Box
              key={option}
              component="button"
              type="button"
              aria-label={option === unassignedTypeColor ? "No colour" : option}
              onClick={(event) => {
                event.stopPropagation();
                onChange(option);
                popupState.close();
              }}
              sx={{
                width: optionSwatchSize,
                height: optionSwatchSize,
                p: 0,
                borderRadius: "50%",
                border: "none",
                cursor: "pointer",
                backgroundColor: option,
              }}
            />
          ))}
        </Box>
      </Popover>
    </>
  );
};
