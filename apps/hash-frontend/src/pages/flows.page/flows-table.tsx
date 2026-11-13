import { useMutation, useQuery } from "@apollo/client";
import { useRouter } from "next/router";
import { useState } from "react";

import { EllipsisMenu } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import {
  archiveFlowDefinitionMutation,
  getFlowDefinitionRunsQuery,
} from "../../graphql/queries/knowledge/flow.queries";
import { Link } from "../../shared/ui/link";
import { ArchiveFlowDialog } from "../@/[shortname]/flows/[flow-def-id]/edit.page/shared/archive-flow-dialog";
import {
  getShortRunId,
  shortRunIdFont,
} from "../@/[shortname]/flows/[flow-def-id]/edit.page/shared/run-id";
import { RunGlyph } from "../@/[shortname]/flows/[flow-def-id]/edit.page/shared/run-marks";
import {
  getRunState,
  runStates,
} from "../@/[shortname]/flows/[flow-def-id]/edit.page/shared/run-state";
import { formatRunTime } from "../@/[shortname]/flows/[flow-def-id]/edit.page/shared/run-times";
import { flowDefinitionsQuery } from "../shared/use-flow-definitions";

import type {
  ArchiveFlowDefinitionMutation,
  ArchiveFlowDefinitionMutationVariables,
  GetFlowDefinitionRunsQuery,
  GetFlowDefinitionRunsQueryVariables,
} from "../../graphql/api-types.gen";
import type { RunState } from "../@/[shortname]/flows/[flow-def-id]/edit.page/shared/run-state";
import type { StepState } from "../@/[shortname]/flows/[flow-def-id]/edit.page/shared/step-states";
import type { EntityId } from "@blockprotocol/type-system";

/** A flow as the table shows it. */
export type FlowRow = {
  flowDefinitionEntityId: EntityId;
  name: string;
  /** Where the flow opens: the editor, or for a flow the user can't edit, its page. */
  path: string;
  /** Whether the user can edit the flow, and so archive it. */
  editable: boolean;
  lastEditedAt: string;
};

/**
 * How many of a flow's runs to read. The API gives the runs that changed most recently, so the newest run is among
 * them unless this many of the flow's other runs changed after it last did. How many runs there are is counted in full.
 */
const runsPageSize = 10;

/** As the Logs tab polls a flow's runs. */
const refreshInterval = 10_000;

/* A run is marked with the glyph of the step state it looks like, as on the canvas. */
const runGlyphStates: Record<RunState, StepState> = {
  running: "running",
  needsReview: "needsReview",
  completed: "done",
  failed: "failed",
  timedOut: "failed",
  cancelled: "skipped",
  unknown: "notReached",
};

const box = css({
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  borderRadius: "xl",
  overflow: "hidden",
  bg: "bgSolid.min",
});
const table = css({
  width: "full",
  /* So that the columns keep their widths while a search narrows the rows. */
  tableLayout: "fixed",
  borderCollapse: "collapse",
  textStyle: "sm",
  "& th": {
    height: "8",
    px: "3",
    textAlign: "left",
    textStyle: "xs",
    fontWeight: "medium",
    color: "fg.muted",
    bg: "bg.subtle",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "bd.subtle",
  },
  "& td": {
    height: "12",
    px: "3",
    fontWeight: "medium",
    color: "fg.muted",
    whiteSpace: "nowrap",
    fontVariantNumeric: "tabular-nums",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "bd.subtle",
  },
  "& tr:last-child td": { borderBottomWidth: "[0]" },
  "& th:first-child, & td:first-child": { pl: "6" },
});
const openableRow = css({
  cursor: "pointer",
  _hover: { bg: "bg.subtle" },
});
const nameText = css({ color: "fg.heading", whiteSpace: "normal" });
const lastRun = css({ display: "inline-flex", alignItems: "center", gap: "2" });
const subtle = css({ color: "fg.subtle" });
const menu = css({ display: "flex", justifyContent: "flex-end" });

/** The row's menu, which has Archive, as the editor's does: flows are archived, never deleted. */
const FlowMenu = ({ flow }: { flow: FlowRow }) => {
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);

  const [archiveFlowDefinition] = useMutation<
    ArchiveFlowDefinitionMutation,
    ArchiveFlowDefinitionMutationVariables
  >(archiveFlowDefinitionMutation);

  return (
    /* Neither the menu nor its dialog opens the flow: React passes their clicks up to the row through the portals. */
    <div
      role="presentation"
      className={menu}
      onClick={(event) => event.stopPropagation()}
    >
      <EllipsisMenu
        iconName="ellipsis"
        variant="ghost"
        size="xs"
        items={[
          {
            id: "archive",
            text: "Archive",
            tone: "error",
            onClick: () => setArchiveDialogOpen(true),
          },
        ]}
      />
      {archiveDialogOpen && (
        <ArchiveFlowDialog
          name={flow.name}
          onArchive={async () => {
            /* The flow's row leaves the list once the flows are read again. */
            await archiveFlowDefinition({
              variables: {
                flowDefinitionEntityId: flow.flowDefinitionEntityId,
              },
              refetchQueries: [flowDefinitionsQuery],
              awaitRefetchQueries: true,
            });
            setArchiveDialogOpen(false);
          }}
          onClose={() => setArchiveDialogOpen(false)}
        />
      )}
    </div>
  );
};

const LastRun = ({
  run,
  now,
}: {
  run: GetFlowDefinitionRunsQuery["getFlowRuns"]["flowRuns"][number];
  now: Date;
}) => {
  const state = getRunState(run);

  return (
    <span className={lastRun}>
      <RunGlyph state={runGlyphStates[state]} label={runStates[state].label} />
      <span>
        Run{" "}
        <span className={shortRunIdFont}>
          {getShortRunId(run.flowRunEntityId)}
        </span>{" "}
        · {formatRunTime(new Date(run.startedAt), now)}
      </span>
    </span>
  );
};

const FlowTableRow = ({ flow, now }: { flow: FlowRow; now: Date }) => {
  const router = useRouter();

  const { data, error } = useQuery<
    GetFlowDefinitionRunsQuery,
    GetFlowDefinitionRunsQueryVariables
  >(getFlowDefinitionRunsQuery, {
    variables: {
      flowDefinitionEntityId: flow.flowDefinitionEntityId,
      cursor: null,
      limit: runsPageSize,
    },
    pollInterval: refreshInterval,
    skipPollAttempt: () => document.visibilityState !== "visible",
  });

  const runs = data?.getFlowRuns;
  /* The API sorts each page newest first. */
  const newestRun = runs?.flowRuns[0];

  return (
    <tr
      className={openableRow}
      onClick={(event) => {
        /* A click that ends selecting text isn't a click on the row. */
        if (window.getSelection()?.toString()) {
          return;
        }

        /* A click with a modifier opens the flow in a new tab, as one on its name's link does. */
        if (event.metaKey || event.ctrlKey || event.shiftKey) {
          window.open(flow.path, "_blank", "noopener");
          return;
        }

        void router.push(flow.path);
      }}
    >
      <td>
        <Link
          href={flow.path}
          noLinkStyle
          /* The row opens the flow too. */
          onClick={(event) => event.stopPropagation()}
        >
          <span className={nameText}>{flow.name}</span>
        </Link>
      </td>
      <td>
        {newestRun ? (
          <LastRun run={newestRun} now={now} />
        ) : runs ? (
          <span className={subtle}>No runs yet</span>
        ) : error ? (
          <span className={subtle}>Couldn't load runs</span>
        ) : null}
      </td>
      <td>
        {runs &&
          (runs.totalCount === 0
            ? "–"
            : `${runs.totalCount} ${runs.totalCount === 1 ? "run" : "runs"}`)}
      </td>
      <td>{formatRunTime(new Date(flow.lastEditedAt), now)}</td>
      <td>{flow.editable && <FlowMenu flow={flow} />}</td>
    </tr>
  );
};

/** The flows, each with its newest run and how many it has. A row opens its flow. */
export const FlowsTable = ({
  flows,
  search,
}: {
  flows: FlowRow[];
  /** What the flows were searched for, to say nothing matches it. */
  search: string;
}) => {
  const now = new Date();

  return (
    <div className={box}>
      <table className={table}>
        <thead>
          <tr>
            <th>Name</th>
            <th className={css({ width: "[272px]" })}>Last run</th>
            <th className={css({ width: "[96px]" })}>Runs</th>
            <th className={css({ width: "[160px]" })}>Last edited</th>
            <th className={css({ width: "[56px]" })} aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {flows.map((flow) => (
            <FlowTableRow
              key={flow.flowDefinitionEntityId}
              flow={flow}
              now={now}
            />
          ))}
          {flows.length === 0 && (
            <tr>
              <td
                colSpan={5}
                className={cx(subtle, css({ fontWeight: "normal" }))}
              >
                No flows match “{search}”
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
