import { CopyRegularIcon, IconButton } from "@hashintel/design-system";
import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";
import { Tooltip, Typography } from "@mui/material";
import { useState } from "react";

import { GridEditorWrapper } from "../@/[shortname]/entities/[entity-uuid].page/entity-editor/shared/grid-editor-wrapper";

export const ReadonlyGridPopup = ({
  value,
  minHeight,
}: {
  value: unknown;
  minHeight?: number | string;
}) => {
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
        minHeight,
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
          <CopyRegularIcon
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
