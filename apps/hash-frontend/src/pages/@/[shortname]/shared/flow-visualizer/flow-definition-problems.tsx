import { Box, Stack, Typography } from "@mui/material";

import { CloseIcon } from "@hashintel/design-system";

import { flowSectionBorderRadius } from "./shared/styles";

import type { FlowDefinitionDiagnostic } from "@local/hash-isomorphic-utils/flows/validate-flow-definition";

/**
 * Shown in place of the net of a flow saved before it was valid: the errors that stop it being compiled or run.
 */
export const FlowDefinitionProblems = ({
  diagnostics,
}: {
  diagnostics: FlowDefinitionDiagnostic[];
}) => {
  const errors = diagnostics.filter(({ severity }) => severity === "error");

  return (
    <Box
      sx={{
        background: ({ palette }) => palette.common.white,
        border: ({ palette }) => `1px solid ${palette.gray[30]}`,
        borderRadius: flowSectionBorderRadius,
        px: 3,
        py: 2.5,
      }}
    >
      <Typography sx={{ fontSize: 15, fontWeight: 600, mb: 0.5 }}>
        This flow isn't valid yet
      </Typography>
      <Typography
        variant="smallTextParagraphs"
        component="p"
        sx={{ color: ({ palette }) => palette.gray[60], mb: 2 }}
      >
        It can't be shown as a net or run until{" "}
        {errors.length === 1
          ? "this problem is fixed"
          : `these ${errors.length} problems are fixed`}
        .
      </Typography>
      <Stack component="ul" gap={1.25} sx={{ listStyle: "none", m: 0, p: 0 }}>
        {errors.map(({ code, message, path }) => (
          <Stack
            component="li"
            direction="row"
            gap={1.25}
            key={`${code}-${path.join(".")}-${message}`}
          >
            <CloseIcon
              sx={{
                fill: ({ palette }) => palette.red[80],
                fontSize: 9,
                mt: 0.75,
              }}
            />
            <Box>
              <Typography sx={{ fontSize: 14 }}>{message}</Typography>
              {path.length > 0 && (
                <Typography
                  sx={{
                    color: ({ palette }) => palette.gray[50],
                    fontFamily: "monospace",
                    fontSize: 12,
                  }}
                >
                  {path.join(".")}
                </Typography>
              )}
            </Box>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
};
