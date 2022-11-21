import { Chip, FontAwesomeIcon } from "@hashintel/hash-design-system";
import { Tooltip } from "@mui/material";
import { faText } from "../../../../../../../../../../../shared/icons/pro/fa-text";

export const ValueChip = ({
  value,
  selected,
}: {
  value: unknown;
  selected: boolean;
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
        <Tooltip title="Text" placement="top">
          <FontAwesomeIcon
            icon={{ icon: faText }}
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
      label={String(value)}
    />
  );
};
