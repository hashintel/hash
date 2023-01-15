import { UnknownRecord } from "@blockprotocol/core";
import {
  JsonSchema,
  validateDataAgainstSchema,
} from "@local/hash-isomorphic-utils/json-utils";
import { Box, Typography } from "@mui/material";
import { ReactElement } from "react";

type DataMapPreviewProps = {
  sourceTree: UnknownRecord;
  targetSchema: JsonSchema;
  transformedTree: UnknownRecord;
};

export const DataMapPreview = ({
  sourceTree,
  targetSchema,
  transformedTree,
}: DataMapPreviewProps): ReactElement => {
  const validationErrors = validateDataAgainstSchema(
    transformedTree,
    targetSchema,
  ).errors;

  return (
    <>
      <Box
        sx={({ palette }) => ({
          borderBottom: `1px solid ${palette.gray[20]}`,
          py: 1,
        })}
      >
        <Typography mb={1} fontWeight={600} variant="smallTextLabels">
          Source tree
        </Typography>
        <Typography component="pre" variant="microText" fontWeight={300}>
          {JSON.stringify(sourceTree, undefined, 2)}
        </Typography>
      </Box>
      <Box
        sx={({ palette }) => ({
          borderBottom: `1px solid ${palette.gray[20]}`,
          py: 1,
        })}
      >
        <Typography mb={1} fontWeight={600} variant="smallTextLabels">
          Transformed tree
        </Typography>
        <Typography component="pre" variant="microText" fontWeight={300}>
          {JSON.stringify(transformedTree, undefined, 2)}
        </Typography>
      </Box>
      {validationErrors.length > 0 && (
        <Box pt={1}>
          <Typography mb={1} fontWeight={600} variant="smallTextLabels">
            Validation Errors
          </Typography>
          {validationErrors.map(({ path, message }, index) => (
            <Typography
              component="p"
              key={`${path[0]}${message}`}
              variant="microText"
              fontWeight={300}
              pb={0.5}
            >
              {index + 1}. {path.length > 0 ? `${path}: ` : ""}
              {message}
            </Typography>
          ))}
        </Box>
      )}
    </>
  );
};
