import { Box, Popover } from "@mui/material";
import {
  bindPopover,
  bindTrigger,
  usePopupState,
} from "material-ui-popup-state/hooks";

import { noColor, typeColorPalette } from "../shared/type-colors";

import type { VersionedUrl } from "@blockprotocol/type-system";
import type { FunctionComponent, MouseEvent } from "react";

/** The swatch shown in the type row; exported so the row can reserve its space. */
export const triggerSwatchSize = 16;
/** The larger swatches shown in the palette dropdown. */
const optionSwatchSize = 22;

/**
 * Hue angle (0–360°) of a `#RRGGBB` colour, for laying the palette out as a
 * spectrum. `colorjs.io` (which `brandmarkScale` uses) is dev-only, so the hue
 * is derived here with the standard HSL formula.
 */
const hueOf = (hex: string): number => {
  const int = parseInt(hex.slice(1), 16);
  const red = ((int >> 16) & 0xff) / 255;
  const green = ((int >> 8) & 0xff) / 255;
  const blue = (int & 0xff) / 255;
  const max = Math.max(red, green, blue);
  const delta = max - Math.min(red, green, blue);
  if (delta === 0) {
    return 0;
  }
  const hue =
    max === red
      ? ((green - blue) / delta) % 6
      : max === green
        ? (blue - red) / delta + 2
        : (red - green) / delta + 4;
  return (hue * 60 + 360) % 360;
};

// The palette colours sorted into spectrum order for the picker (the unsorted
// `typeColorPalette` order still drives the default per-type assignment), plus a
// trailing "no colour" option (which maps to grey).
const swatchOptions = [
  ...[...typeColorPalette].sort(
    (first, second) => hueOf(first) - hueOf(second),
  ),
  noColor,
];

type TypeColorSelectorProps = {
  entityTypeId: VersionedUrl;
  color: string;
  onChange: (color: string) => void;
};

/**
 * A small colour swatch that opens a palette popover, letting a type be assigned
 * one of the Brandmark colours (or "no colour", which renders grey) in the
 * network graph view.
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
          {swatchOptions.map((option) => {
            const isNoColor = option === noColor;
            return (
              <Box
                key={option}
                component="button"
                type="button"
                aria-label={isNoColor ? "No colour" : option}
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
                  cursor: "pointer",
                  // "No colour" reads as the standard empty-circle-with-a-slash
                  // symbol rather than a grey dot, though picking it still maps
                  // the type to grey; every other option is its own filled swatch.
                  ...(isNoColor
                    ? {
                        // A gray[40] rim keeps the gray[30]-filled swatch defined
                        // against the popover's white background.
                        border: ({ palette }) =>
                          `1px solid ${palette.gray[40]}`,
                        backgroundColor: ({ palette }) => palette.gray[30],
                        position: "relative",
                        overflow: "hidden",
                        "&::after": {
                          content: '""',
                          position: "absolute",
                          top: "calc(50% - 0.75px)",
                          left: -6,
                          right: -6,
                          height: "1.5px",
                          transform: "rotate(-45deg)",
                          backgroundColor: ({ palette }) => palette.red[70],
                        },
                      }
                    : { border: "none", backgroundColor: option }),
                }}
              />
            );
          })}
        </Box>
      </Popover>
    </>
  );
};
