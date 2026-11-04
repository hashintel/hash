import { Box } from "@mui/material";
import { useMemo } from "react";

import { isGoalFlowDefinitionEntityId } from "@local/hash-isomorphic-utils/flows/flow-definition-ids";

import { useAuthenticatedUser } from "../shared/auth-info-context";
import { useFlowRunsContext } from "../shared/flow-runs-context";
import { flowRunStatusToStatusText } from "../shared/flow-tables";
import { GoalListSection } from "./goals-list/goal-list-section";

import type { GoalSummary } from "./goals-list/goal-list-section/goal-row";

export const GoalsList = () => {
  const { flowRuns, loading } = useFlowRunsContext();

  const { authenticatedUser } = useAuthenticatedUser();

  const { activeGoals, archivedGoals } = useMemo<{
    activeGoals: GoalSummary[];
    archivedGoals: GoalSummary[];
  }>(() => {
    const active: GoalSummary[] = [];
    const archived: GoalSummary[] = [];

    const webByWebId: Record<string, GoalSummary["web"]> = {};

    for (const run of flowRuns) {
      if (!isGoalFlowDefinitionEntityId(run.flowDefinitionEntityId)) {
        continue;
      }

      const { webId, flowRunEntityId, startedAt, closedAt } = run;

      let web: GoalSummary["web"] | undefined = webByWebId[webId];

      if (!web) {
        if (webId === authenticatedUser.accountId) {
          web = {
            avatarUrl:
              authenticatedUser.hasAvatar?.imageEntity.properties[
                "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/"
              ],
            name: authenticatedUser.displayName ?? "Unknown",
            shortname: authenticatedUser.shortname ?? "unknown",
          };
        } else {
          const org = authenticatedUser.memberOf.find(
            (memberOf) => memberOf.org.webId === webId,
          )?.org;
          if (!org) {
            throw new Error(`Could not find org with id ${webId}`);
          }
          web = {
            avatarUrl:
              org.hasAvatar?.imageEntity.properties[
                "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/"
              ],
            name: org.name,
            shortname: org.shortname,
          };
        }
        webByWebId[webId] = web;
      }

      const status = flowRunStatusToStatusText(run.status);

      const goalRun = {
        flowRunEntityId,
        startedAt,
        endedAt: closedAt ?? undefined,
        openInputRequests: run.openInputRequests.filter(
          ({ type }) => type === "human-input",
        ).length,
        /**
         * @todo H-2722 – decide how to store an informative name per goal / flow run
         */
        name: run.name,
        status,
        web,
      };

      if (status === "Running") {
        active.push(goalRun);
      } else {
        archived.push(goalRun);
      }
    }

    return {
      activeGoals: active,
      archivedGoals: archived,
    };
  }, [authenticatedUser, flowRuns]);

  return (
    <Box
      sx={({ palette }) => ({
        background: palette.common.white,
        borderRadius: 2,
        border: `1px solid ${palette.gray[30]}`,
        px: 4.5,
        py: 3.25,
      })}
    >
      <Box
        sx={{
          borderBottom: ({ palette }) => `1px solid ${palette.gray[30]}`,
          pb: 4,
          mb: 4,
        }}
      >
        <GoalListSection loading={loading} rows={activeGoals} type="active" />
      </Box>
      <GoalListSection loading={loading} rows={archivedGoals} type="archived" />
    </Box>
  );
};
