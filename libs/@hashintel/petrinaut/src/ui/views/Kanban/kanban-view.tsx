/**
 * @layerRoot ui.views.kanban
 * @role Kanban projection of a status view: columns are labels, cards are tracked instances
 */
import { use, useEffect, useRef, useState } from "react";

import { Select } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import {
  getStatusViewEvaluationScope,
  type InstanceStatus,
  type StatusLabel,
  type StatusView,
} from "@hashintel/petrinaut-core";

import { ExecutionFrameSourceContext } from "../../../react/execution-frame/context";
import { SDCPNContext } from "../../../react/state/sdcpn-context";
import { StatusConditionArtifactsContext } from "../../../react/status-condition-artifacts";
import { formatDwellMs } from "../shared/format-dwell";
import {
  createBoardReplay,
  type BoardSnapshot,
} from "./kanban-view/board-replay";

const rootStyle = css({
  display: "flex",
  flexDirection: "column",
  flex: "[1]",
  minWidth: "[0]",
  minHeight: "[0]",
  gap: "3",
  padding: "4",
  backgroundColor: "neutral.s10",
});

const toolbarStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "3",
  flexShrink: 0,
});

const viewSelectStyle = css({
  width: "[220px]",
});

const emptyStyle = css({
  color: "neutral.s100",
  fontStyle: "italic",
  fontSize: "sm",
  padding: "4",
});

const noticeStyle = css({
  color: "red.s105",
  fontSize: "xs",
  flexShrink: 0,
});

const pendingNoticeStyle = css({
  color: "neutral.s100",
  fontSize: "xs",
  fontStyle: "italic",
  flexShrink: 0,
});

const boardStyle = css({
  display: "flex",
  gap: "3",
  flex: "[1]",
  minHeight: "[0]",
  overflowX: "auto",
  alignItems: "stretch",
});

const columnStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  width: "[240px]",
  flexShrink: 0,
  padding: "2",
  borderRadius: "md",
  backgroundColor: "neutral.a05",
  overflowY: "auto",
});

const columnHeaderStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  paddingX: "1",
  fontSize: "sm",
  fontWeight: "semibold",
  color: "neutral.s120",
});

const columnSwatchStyle = css({
  width: "[10px]",
  height: "[10px]",
  borderRadius: "full",
  flexShrink: 0,
});

const columnCountStyle = css({
  marginLeft: "auto",
  fontSize: "xs",
  color: "neutral.s90",
  fontWeight: "medium",
});

const cardStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  padding: "2",
  borderRadius: "sm",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderLeftWidth: "[3px]",
  backgroundColor: "neutral.s00",
  shadow: "[0px 1px 3px rgba(0, 0, 0, 0.06)]",
});

const cardKeyStyle = css({
  fontSize: "xs",
  fontFamily: "mono",
  fontWeight: "medium",
  color: "neutral.s125",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const cardMetaStyle = css({
  fontSize: "[11px]",
  color: "neutral.s90",
});

/** Columns follow the labels array order, with the exit label last. */
const toColumnOrder = (labels: readonly StatusLabel[]): StatusLabel[] => [
  ...labels.filter((label) => !label.isExit),
  ...labels.filter((label) => label.isExit),
];

const KanbanCard = ({
  instance,
  labelId,
  nowMs,
  tintColor,
}: {
  instance: InstanceStatus;
  labelId: string;
  nowMs: number;
  tintColor: string;
}) => {
  const entryCount = instance.intervals.filter(
    (interval) => interval.labelId === labelId,
  ).length;
  const dwellMs = nowMs - instance.enteredCurrentAtMs;
  return (
    <div className={cardStyle} style={{ borderLeftColor: tintColor }}>
      <div className={cardKeyStyle}>{instance.keyValues.join(", ")}</div>
      <div className={cardMetaStyle}>
        {formatDwellMs(dwellMs)} in this status
        {entryCount > 1 ? ` · entered ×${entryCount}` : ""}
      </div>
    </div>
  );
};

type BoardReplayHandle = {
  replay: ReturnType<typeof createBoardReplay>;
  key: readonly unknown[];
};

const keysEqual = (
  left: readonly unknown[],
  right: readonly unknown[],
): boolean =>
  left.length === right.length &&
  left.every((entry, index) => entry === right[index]);

const KanbanBoard = ({ statusView }: { statusView: StatusView }) => {
  const { petriNetDefinition } = use(SDCPNContext);
  const { sourceId, currentFrameIndex, currentFrameReader, getFramesInRange } =
    use(ExecutionFrameSourceContext);
  const {
    statusConditions,
    pending: conditionsPending,
    error: conditionsError,
  } = use(StatusConditionArtifactsContext);

  const [board, setBoard] = useState<BoardSnapshot>({
    instances: [],
    nowMs: 0,
    conditionErrors: null,
  });
  const [replayError, setReplayError] = useState<string | null>(null);
  const replayRef = useRef<BoardReplayHandle | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!currentFrameReader) {
      return;
    }
    // getFramesInRange is deliberately not part of the identity: in actual
    // mode it is recreated per arriving event, while the replay only needs
    // the latest one when it fetches.
    const replayKey = [
      sourceId,
      statusView,
      statusConditions,
      petriNetDefinition,
    ];
    if (!replayRef.current || !keysEqual(replayRef.current.key, replayKey)) {
      const { places, types } =
        getStatusViewEvaluationScope(petriNetDefinition);
      replayRef.current = {
        replay: createBoardReplay({
          statusView,
          places,
          types,
          statusConditions,
        }),
        key: replayKey,
      };
    }
    const requestId = ++requestIdRef.current;
    replayRef.current.replay
      .advanceTo(currentFrameIndex, getFramesInRange)
      .then((snapshot) => {
        if (requestIdRef.current === requestId) {
          setBoard(snapshot);
          setReplayError(null);
        }
      })
      .catch((error: unknown) => {
        if (requestIdRef.current === requestId) {
          setReplayError(
            error instanceof Error ? error.message : String(error),
          );
        }
      });
  }, [
    currentFrameIndex,
    currentFrameReader,
    getFramesInRange,
    petriNetDefinition,
    sourceId,
    statusConditions,
    statusView,
  ]);

  if (!currentFrameReader) {
    return (
      <span className={emptyStyle}>
        Run a simulation or connect an actual-mode stream to populate the board.
      </span>
    );
  }

  const unlabelledCount = board.instances.filter(
    (instance) => instance.currentLabelId === null,
  ).length;

  return (
    <>
      {replayError !== null && (
        <span className={noticeStyle}>
          Could not derive statuses from frames: {replayError}
        </span>
      )}
      {conditionsError !== null && (
        <span className={noticeStyle}>{conditionsError}</span>
      )}
      {board.conditionErrors !== null && (
        <span className={noticeStyle}>
          {board.conditionErrors.count} token-condition evaluation error
          {board.conditionErrors.count === 1 ? "" : "s"}:{" "}
          {board.conditionErrors.firstMessage}
        </span>
      )}
      {conditionsPending && (
        <span className={pendingNoticeStyle}>
          Compiling token conditions — labels with a condition match nothing
          until compilation lands.
        </span>
      )}
      {unlabelledCount > 0 && (
        <span className={pendingNoticeStyle}>
          {unlabelledCount} tracked instance{unlabelledCount === 1 ? "" : "s"}{" "}
          currently match{unlabelledCount === 1 ? "es" : ""} no label.
        </span>
      )}
      <div className={boardStyle}>
        {toColumnOrder(statusView.labels).map((label) => {
          const columnInstances = board.instances.filter(
            (instance) => instance.currentLabelId === label.id,
          );
          return (
            <div key={label.id} className={columnStyle}>
              <div className={columnHeaderStyle}>
                <span
                  className={columnSwatchStyle}
                  style={{ backgroundColor: label.displayColor }}
                />
                {label.name}
                <span className={columnCountStyle}>
                  {columnInstances.length}
                </span>
              </div>
              {columnInstances.map((instance) => (
                <KanbanCard
                  key={instance.key}
                  instance={instance}
                  labelId={label.id}
                  nowMs={board.nowMs}
                  tintColor={label.displayColor}
                />
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
};

/**
 * Kanban projection of one status view over the current frame source
 * (simulation playback or an actual-mode stream): one column per label in
 * array order with the exit label last, and one card per tracked instance
 * showing its raw key values, time in the current status, and the entry
 * count when it has entered the status more than once.
 */
export const KanbanView = () => {
  const { petriNetDefinition } = use(SDCPNContext);
  const statusViews = petriNetDefinition.statusViews ?? [];
  const [selectedStatusViewId, setSelectedStatusViewId] = useState<
    string | null
  >(null);

  const statusView =
    statusViews.find((view) => view.id === selectedStatusViewId) ??
    statusViews[0];

  if (!statusView) {
    return (
      <div className={rootStyle}>
        <span className={emptyStyle}>
          No status views yet. Create one in the Simulate panel's Status views
          tab to project net state onto a board.
        </span>
      </div>
    );
  }

  return (
    <div className={rootStyle}>
      <div className={toolbarStyle}>
        <div className={viewSelectStyle}>
          <Select
            required
            size="sm"
            value={statusView.id}
            onChange={setSelectedStatusViewId}
            items={statusViews.map((view) => ({
              value: view.id,
              text: view.name,
            }))}
          />
        </div>
      </div>
      <KanbanBoard key={statusView.id} statusView={statusView} />
    </div>
  );
};
