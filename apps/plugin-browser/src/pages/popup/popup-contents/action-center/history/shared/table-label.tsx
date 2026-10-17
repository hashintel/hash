import { Link, Stack, Typography } from "@mui/material";

import { ArrowUpRightRegularIcon } from "@hashintel/design-system";
import { generatedFilteredWorkersPath } from "@local/hash-isomorphic-utils/flows/frontend-paths";

import { generateBrowserInferenceFlowDefinitionEntityId } from "../../../../../../shared/browser-inference-flow-definition";

import type { WebId } from "@blockprotocol/type-system";

export const TableLabel = ({
  hashWebId,
  type,
}: {
  hashWebId: WebId;
  type: "manual" | "automatic";
}) => {
  return (
    <Stack direction="row" justifyContent="space-between" mb={0.75}>
      <Typography variant="smallCaps" sx={{ fontSize: 12 }}>
        {type === "manual" ? "Manually" : "Automatically"} triggered
      </Typography>
      <Link
        href={`${FRONTEND_ORIGIN}${generatedFilteredWorkersPath({
          flowDefinitionEntityIds: [
            generateBrowserInferenceFlowDefinitionEntityId({
              hashWebId,
              trigger: type,
            }),
          ],
        })}`}
        sx={{
          alignItems: "center",
          color: ({ palette }) => palette.gray[50],
          display: "flex",
          fontSize: 13,
          textDecoration: "none",
          "&:hover": {
            color: ({ palette }) => palette.gray[90],
            "& svg": {
              fill: ({ palette }) => palette.gray[90],
            },
          },
          transition: ({ transitions }) => transitions.create("color"),
        }}
        target="_blank"
      >
        View in HASH
        <ArrowUpRightRegularIcon
          sx={{
            fontSize: 12,
            fill: ({ palette }) => palette.gray[50],
            ml: 0.3,
            transition: ({ transitions }) => transitions.create("fill"),
          }}
        />
      </Link>
    </Stack>
  );
};
