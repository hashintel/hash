import { Link, Stack, Typography } from "@mui/material";

import { ArrowUpRightRegularIcon } from "@hashintel/design-system";
import {
  flowDefinitionIds,
  generateHashFlowDefinitionEntityId,
} from "@local/hash-isomorphic-utils/flows/flow-definition-ids";
import { generatedFilteredWorkersPath } from "@local/hash-isomorphic-utils/flows/frontend-paths";

import { useUserContext } from "../../../shared/user-context";

export const TableLabel = ({ type }: { type: "manual" | "automatic" }) => {
  const { user } = useUserContext();

  if (!user) {
    return null;
  }

  return (
    <Stack direction="row" justifyContent="space-between" mb={0.75}>
      <Typography variant="smallCaps" sx={{ fontSize: 12 }}>
        {type === "manual" ? "Manually" : "Automatically"} triggered
      </Typography>
      <Link
        href={`${FRONTEND_ORIGIN}${generatedFilteredWorkersPath({
          flowDefinitionEntityIds: [
            generateHashFlowDefinitionEntityId(
              user.hashWebId,
              type === "manual"
                ? flowDefinitionIds.manualBrowserInference
                : flowDefinitionIds.automaticBrowserInference,
            ),
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
