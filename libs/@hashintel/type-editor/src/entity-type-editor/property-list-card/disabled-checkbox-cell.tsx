import {
  Box,
  Checkbox,
  checkboxClasses,
  svgIconClasses,
  TableCellProps,
  Tooltip,
} from "@mui/material";

import { EntityTypeTableCenteredCell } from "../shared/entity-type-table";

export const DisabledCheckboxCell = ({
  title,
  checked,
  width,
  sx,
}: TableCellProps & {
  title?: string;
  checked?: boolean;
  width: number;
}) => {
  return (
    <EntityTypeTableCenteredCell width={width}>
      <Tooltip title={title} placement="top" disableInteractive>
        <Box
          sx={[
            {
              boxSizing: "content-box",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            },
            ...(Array.isArray(sx) ? sx : [sx]),
          ]}
        >
          <Checkbox
            disabled
            checked={checked}
            sx={[
              {
                color: ({ palette }) => `${palette.gray[40]} !important`,
                [`.${svgIconClasses.root}`]: {
                  color: "inherit",
                },
                [`&.${checkboxClasses.checked}.${checkboxClasses.disabled}`]: {
                  color: ({ palette }) => `${palette.blue[30]} !important`,
                },
              },
            ]}
          />
        </Box>
      </Tooltip>
    </EntityTypeTableCenteredCell>
  );
};
