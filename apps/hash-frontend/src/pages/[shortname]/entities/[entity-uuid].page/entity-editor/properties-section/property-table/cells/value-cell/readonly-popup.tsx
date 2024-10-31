import { CopyIconRegular, IconButton } from "@hashintel/design-system";
import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";
import { Tooltip, Typography } from "@mui/material";
import { useState } from "react";

import { GridEditorWrapper } from "../../../../shared/grid-editor-wrapper";
import type { ValueCellEditorComponent } from "./types";

export const ReadonlyPopup: ValueCellEditorComponent = (props) => {
  const { value: cell } = props;
  const { value } = cell.data.propertyRow;

  const stringValue = stringifyPropertyValue(value);

  const [tooltip, setTooltip] = useState("Copy to clipboard");

  return (
    <GridEditorWrapper
      sx={{
        px: 2,
        py: 1,
        display: "block",
        overflow: "auto",
        position: "relative",
        maxHeight: "50vh",
      }}
    >
      <Tooltip title={tooltip}>
        <IconButton
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(stringValue);
              setTooltip("Copied!");
            } catch {
              setTooltip("Couldn't copy");
            } finally {
              setTimeout(() => setTooltip("Copy to clipboard"), 3_000);
            }
          }}
          sx={({ palette, transitions }) => ({
            background: "rgba(255, 255, 255, 0.5)",
            svg: {
              fontSize: 14,
            },
            "&:hover": {
              "& svg": {
                fill: palette.blue[70],
                transition: transitions.create("fill"),
              },
            },
            position: "absolute",
            top: 2,
            right: 2,
            padding: "4px",
          })}
        >
          <CopyIconRegular
            sx={{
              fill: "rgba(0, 0, 0, 0.3)",
            }}
          />
        </IconButton>
      </Tooltip>
      <Typography
        sx={{ fontSize: 14, color: ({ palette }) => palette.gray[80] }}
      >
        {stringValue}
      </Typography>
    </GridEditorWrapper>
  );
};
