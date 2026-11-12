import { useQuery } from "@apollo/client";

import { Button, Menu } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { getFlowRunById } from "@local/hash-isomorphic-utils/graphql/queries/flow.queries";

import { getShortRunId, shortRunIdFont } from "../shared/run-id";
import { RunGlyph } from "../shared/run-marks";
import { getRunState, runStates } from "../shared/run-state";
import { formatRunTime } from "../shared/run-times";
import { getSwitcherRuns } from "./run-switcher/switcher-runs";

import type {
  GetFlowRunByIdQuery,
  GetFlowRunByIdQueryVariables,
} from "../../../../../../../graphql/api-types.gen";
import type { RunState } from "../shared/run-state";
import type { StepState } from "../shared/step-states";
import type { FlowRuns } from "../shared/use-flow-runs";
import type { EntityId } from "@blockprotocol/type-system";
import type { ItemOrGroup, MenuItem } from "@hashintel/ds-components";

/** A run's mark, from the same set as its steps'. It has none of its own for a cancelled run, so takes skipped's. */
const runStateMarks: Record<RunState, StepState> = {
  running: "running",
  needsReview: "needsReview",
  completed: "done",
  failed: "failed",
  timedOut: "failed",
  cancelled: "skipped",
  unknown: "notReached",
};

const switcher = css({
  display: "flex",
  alignItems: "center",
  gap: "0.5",
  flexShrink: "0",
});
const menuRow = css({ display: "flex", alignItems: "center", gap: "2" });
const startTime = css({
  color: "fg.subtle",
  whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums",
});

const RunName = ({ flowRunEntityId }: { flowRunEntityId: EntityId }) => (
  <span>
    Run <span className={shortRunIdFont}>{getShortRunId(flowRunEntityId)}</span>
  </span>
);

/**
 * The run shown, in the top bar: ‹ and › open the flow's next older and newer run, and its name opens a menu of the
 * flow's newest runs, and the way back to all of them in Logs. Until the flow's runs have loaded, or if the run isn't
 * among them, e.g. one of another flow, it names the run with the arrows off. It reads the run that the run view polls,
 * so a run just started is among them before they're read again.
 */
export const RunSwitcher = ({
  flowRunEntityId,
  flowDefinitionEntityId,
  flowRuns,
  onOpenRun,
  onAllRuns,
}: {
  flowRunEntityId: EntityId;
  flowDefinitionEntityId: EntityId;
  flowRuns: FlowRuns;
  onOpenRun: (flowRunEntityId: EntityId) => void;
  onAllRuns: () => void;
}) => {
  const { data, loading } = useQuery<
    GetFlowRunByIdQuery,
    GetFlowRunByIdQueryVariables
  >(getFlowRunById, { variables: { flowRunEntityId } });
  const openRun = data?.getFlowRunById;

  const { menuRuns, older, newer } =
    flowRuns.status === "loaded"
      ? getSwitcherRuns(
          flowRuns.runs,
          flowRunEntityId,
          openRun?.flowDefinitionEntityId === flowDefinitionEntityId
            ? openRun
            : null,
        )
      : { menuRuns: [], older: null, newer: null };
  const listed = menuRuns.some(
    (run) => run.flowRunEntityId === flowRunEntityId,
  );

  /* A disabled arrow says why. */
  const disabledReason = (direction: "older" | "newer") => {
    if (flowRuns.status === "loading" || (!listed && loading)) {
      return "Loading runs";
    }

    if (flowRuns.status === "failed") {
      return "Couldn't load this flow's runs";
    }

    return listed ? `No ${direction} run` : "Not one of this flow's runs";
  };

  /* A flow with no runs lists none when the run shown isn't its own, so the menu says so, as Logs does. */
  const runItems: MenuItem[] =
    flowRuns.status === "loaded" && menuRuns.length > 0
      ? menuRuns.map((run) => {
          const { label } = runStates[getRunState(run)];

          return {
            id: run.flowRunEntityId,
            text: (
              <span className={menuRow}>
                {/* Its state is named beside it. */}
                <span aria-hidden>
                  <RunGlyph state={runStateMarks[getRunState(run)]} />
                </span>
                <span>
                  <RunName flowRunEntityId={run.flowRunEntityId} /> · {label}
                </span>
              </span>
            ),
            suffix: (
              <span className={startTime}>
                {formatRunTime(new Date(run.startedAt), flowRuns.loadedAt)}
              </span>
            ),
            selected: run.flowRunEntityId === flowRunEntityId,
            onClick: () => onOpenRun(run.flowRunEntityId),
          };
        })
      : [
          flowRuns.status === "loading"
            ? {
                id: "loading",
                text: "Loading runs",
                loading: true,
                onClick: () => undefined,
              }
            : {
                id: "none",
                text:
                  flowRuns.status === "failed"
                    ? "Couldn't load this flow's runs"
                    : "No runs yet",
                disabled: true,
                onClick: () => undefined,
              },
        ];

  const items: ItemOrGroup<MenuItem>[] = [
    { id: "runs", label: "Runs · newest first", items: runItems },
    {
      id: "all",
      label: "",
      items: [
        { id: "all-runs", text: "All runs", icon: "list", onClick: onAllRuns },
      ],
    },
  ];

  return (
    <div className={switcher}>
      <Button
        variant="ghost"
        size="sm"
        iconName="chevronLeft"
        tooltip={older ? "Older run" : disabledReason("older")}
        disabled={!older}
        onClick={() => older && onOpenRun(older.flowRunEntityId)}
      />
      <Menu
        items={items}
        trigger={
          <Button
            variant="ghost"
            size="sm"
            iconName="chevronDown"
            iconPosition="right"
          >
            <RunName flowRunEntityId={flowRunEntityId} />
          </Button>
        }
      />
      <Button
        variant="ghost"
        size="sm"
        iconName="chevronRight"
        tooltip={newer ? "Newer run" : disabledReason("newer")}
        disabled={!newer}
        onClick={() => newer && onOpenRun(newer.flowRunEntityId)}
      />
    </div>
  );
};
