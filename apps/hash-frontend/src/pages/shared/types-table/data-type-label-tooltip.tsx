import { Box, Stack, Typography } from "@mui/material";

import { getDataTypeLabelExample } from "./data-type-label-tooltip/example";

import type {
  DataType,
  DataTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";

export const DataTypeLabelTooltip = ({
  schema,
  dataTypes,
}: {
  schema: DataType;
  dataTypes: Record<VersionedUrl, DataTypeWithMetadata>;
}) => {
  const example = getDataTypeLabelExample(schema, dataTypes);
  return (
    <Stack
      sx={{
        px: 1.5,
        py: 1,
        gap: 0.5,
        maxWidth: 320,
        border: 1,
        borderColor: "gray.30",
        borderRadius: 1,
        boxShadow: 2,
      }}
    >
      <Typography sx={{ fontSize: 12, color: "gray.70", fontWeight: 500 }}>
        Example value
      </Typography>
      <Typography
        sx={{
          fontSize: 14,
          color: "gray.90",
          overflowWrap: "anywhere",
          whiteSpace: "pre-wrap",
        }}
      >
        {example
          ? example.map((part, index) => (
              <Box
                component="span"
                // eslint-disable-next-line react/no-array-index-key -- Value parts have a fixed order and no component state.
                key={index}
                sx={{ color: part.kind === "label" ? "gray.70" : undefined }}
              >
                {part.text}
              </Box>
            ))
          : "No example available for these constraints."}
      </Typography>
    </Stack>
  );
};
