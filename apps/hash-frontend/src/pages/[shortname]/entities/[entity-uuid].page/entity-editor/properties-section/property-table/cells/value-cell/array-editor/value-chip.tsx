import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { faAsterisk } from "@fortawesome/free-solid-svg-icons";
import { Chip, FontAwesomeIcon } from "@hashintel/design-system";
import { Box, Tooltip } from "@mui/material";

export const ValueChip = ({
  title,
  icon = faAsterisk,
  imageSrc,
  selected,
  tooltip = "",
}: {
  title: string;
  icon?: Pick<IconDefinition, "icon">;
  imageSrc?: string;
  selected: boolean;
  tooltip?: string;
}) => {
  return (
    <Chip
      sx={[
        {
          minWidth: 0,
          background: "white",
          borderColor: selected ? "blue.70" : "gray.20",
          svg: {
            color: ({ palette }) => `${palette.blue[70]} !important`,
          },
        },
      ]}
      icon={
        imageSrc ? (
          <Box
            component="img"
            src={imageSrc}
            sx={{
              borderRadius: 1,
              height: 25,
              width: "auto",
              objectFit: "contain",
              maxWidth: 80,
            }}
          />
        ) : (
          <Tooltip title={tooltip} placement="top">
            <FontAwesomeIcon
              icon={icon}
              sx={{
                /**
                 * used zIndex:1, otherwise label of the chip is rendered over icon with transparent background,
                 * which prevents tooltip from opening
                 */
                zIndex: 1,
              }}
            />
          </Tooltip>
        )
      }
      label={title}
    />
  );
};
