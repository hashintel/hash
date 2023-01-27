import { faAsterisk, IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { Chip, FontAwesomeIcon } from "@local/design-system";
import { Tooltip } from "@mui/material";

export const ValueChip = ({
  title,
  selected,
  icon = faAsterisk,
  tooltip = "",
}: {
  title: string;
  selected: boolean;
  icon?: Pick<IconDefinition, "icon">;
  tooltip?: string;
}) => {
  return (
    <Chip
      sx={[
        { minWidth: 0 },
        selected && {
          background: "white",
          borderColor: "blue.70",
          svg: {
            color: ({ palette }) => `${palette.blue[70]} !important`,
          },
        },
      ]}
      icon={
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
      }
      label={title}
    />
  );
};
