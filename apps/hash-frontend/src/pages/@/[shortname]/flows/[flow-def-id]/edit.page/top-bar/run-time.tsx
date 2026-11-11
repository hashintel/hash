import { useQuery } from "@apollo/client";
import { useEffect, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";
import { getFlowRunById } from "@local/hash-isomorphic-utils/graphql/queries/flow.queries";

import { getRunState, runStates } from "../shared/run-state";
import { formatRunTimeLine } from "./run-time/run-time-line";

import type {
  GetFlowRunByIdQuery,
  GetFlowRunByIdQueryVariables,
} from "../../../../../../../graphql/api-types.gen";
import type { EntityId } from "@blockprotocol/type-system";

const runTime = css({
  textStyle: "sm",
  fontWeight: "medium",
  color: "fg.muted",
  whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums",
});

/**
 * How long the run shown took and when it started, before its actions, counting up while it runs. It reads the run
 * that the run view polls, as Stop and Re-run do, so it ends when they change.
 */
export const RunTime = ({
  flowRunEntityId,
  flowDefinitionEntityId,
}: {
  flowRunEntityId: EntityId;
  flowDefinitionEntityId: EntityId;
}) => {
  const { data } = useQuery<GetFlowRunByIdQuery, GetFlowRunByIdQueryVariables>(
    getFlowRunById,
    { variables: { flowRunEntityId } },
  );
  const run = data?.getFlowRunById;

  const state = run ? getRunState(run) : null;
  const counting =
    !!run && !run.closedAt && !!state && runStates[state].tab === "running";

  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!counting) {
      return;
    }

    const interval = setInterval(() => setNow(new Date()), 1_000);

    return () => clearInterval(interval);
  }, [counting]);

  /* The run view says when a run is missing or of another flow. */
  if (!run || !state || run.flowDefinitionEntityId !== flowDefinitionEntityId) {
    return null;
  }

  return (
    <span className={runTime}>
      {formatRunTimeLine(
        {
          state,
          startedAt: new Date(run.startedAt),
          endedAt: run.closedAt ? new Date(run.closedAt) : null,
        },
        now,
      )}
    </span>
  );
};
