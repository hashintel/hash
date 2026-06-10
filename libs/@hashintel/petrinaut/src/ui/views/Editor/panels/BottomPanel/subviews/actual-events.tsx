import { use } from "react";

import { Button, Icon, Menu, type MenuItem } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { ActualModeContext } from "../../../../../../react/actual-mode-context";
import { exportActualModeRecording } from "../../../../../file-io/export-actual-mode-recording";
import { exportSDCPN } from "../../../../../file-io/export-sdcpn";

import type { SubView } from "../../../../../components/sub-view/types";
import type {
  ActualModeMarking,
  ActualModeTransitionFiring,
} from "@hashintel/petrinaut-core";

const MAX_VISIBLE_EVENTS = 500;

const rootStyle = css({
  display: "flex",
  flexDirection: "column",
  height: "full",
  minHeight: "[0]",
  gap: "3",
});

const toolbarStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
  flexWrap: "wrap",
  flexShrink: 0,
});

const statusStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  color: "neutral.s105",
  fontSize: "xs",
});

const countStyle = css({
  color: "neutral.s120",
  fontWeight: "medium",
});

const exportChevronStyle = css({
  opacity: "[0.65]",
});

const emptyStyle = css({
  color: "neutral.s100",
  fontStyle: "italic",
  fontSize: "xs",
});

const tableWrapperStyle = css({
  minHeight: "[0]",
  overflow: "auto",
  borderTopWidth: "thin",
  borderColor: "neutral.bd.subtle",
});

const tableStyle = css({
  width: "[100%]",
  borderCollapse: "separate",
  borderSpacing: "[0]",
  tableLayout: "fixed",
});

const headerRowStyle = css({
  position: "sticky",
  top: "[0]",
  zIndex: "base",
  backgroundColor: "white.a85",
  backdropFilter: "[blur(13px)]",
  color: "neutral.s95",
  fontSize: "[10px]",
  fontWeight: "semibold",
  letterSpacing: "[0]",
  lineHeight: "[1]",
  textTransform: "uppercase",
});

const cellStyle = css({
  padding: "[8px 10px]",
  borderBottomWidth: "thin",
  borderColor: "neutral.bd.subtle",
  textAlign: "left",
  verticalAlign: "top",
});

const singleLineCellStyle = css({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const eventColumnStyle = css({
  width: "[64px]",
});

const timestampColumnStyle = css({
  width: "[180px]",
});

const transitionColumnStyle = css({
  width: "[220px]",
});

const effectColumnStyle = css({
  width: "[280px]",
});

const indexCellStyle = css({
  color: "neutral.s90",
  fontFamily: "mono",
});

const timestampCellStyle = css({
  color: "neutral.s105",
  fontFamily: "mono",
});

const transitionCellStyle = css({
  color: "neutral.s125",
  fontFamily: "mono",
  fontWeight: "medium",
});

const markingCellStyle = css({
  color: "neutral.s115",
  fontFamily: "mono",
  fontSize: "[11px]",
});

const footerNoteStyle = css({
  color: "neutral.s90",
  fontSize: "[11px]",
  flexShrink: 0,
});

const formatTimestamp = (timestamp: string): string => {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return date.toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "medium",
  });
};

const formatMarkingValue = (
  value: ActualModeMarking[string] | undefined,
): string => {
  if (value === undefined) {
    return "0";
  }

  return Array.isArray(value) ? String(value.length) : String(value);
};

const formatMarking = (marking: ActualModeMarking): string =>
  Object.entries(marking).length === 0
    ? "none"
    : Object.entries(marking)
        .map(([placeId, value]) => `${placeId}: ${formatMarkingValue(value)}`)
        .join(", ");

const EventRow: React.FC<{
  firing: ActualModeTransitionFiring;
  index: number;
}> = ({ firing, index }) => (
  <tr>
    <td
      className={cx(
        cellStyle,
        singleLineCellStyle,
        eventColumnStyle,
        indexCellStyle,
      )}
    >
      #{index + 1}
    </td>
    <td
      className={cx(
        cellStyle,
        singleLineCellStyle,
        timestampColumnStyle,
        timestampCellStyle,
      )}
    >
      {formatTimestamp(firing.ts)}
    </td>
    <td
      className={cx(
        cellStyle,
        singleLineCellStyle,
        transitionColumnStyle,
        transitionCellStyle,
      )}
    >
      {firing.transitionId}
    </td>
    <td
      className={cx(
        cellStyle,
        singleLineCellStyle,
        effectColumnStyle,
        markingCellStyle,
      )}
    >
      {formatMarking(firing.input)}
    </td>
    <td className={cx(cellStyle, singleLineCellStyle, markingCellStyle)}>
      {formatMarking(firing.output)}
    </td>
  </tr>
);

const ActualEventsContent: React.FC = () => {
  const actualMode = use(ActualModeContext);
  const canExportStream =
    actualMode.available &&
    (actualMode.receivedEvents.length > 0 ||
      (actualMode.definition !== null && actualMode.initialState !== null));
  const canExportNet = actualMode.available && actualMode.definition !== null;
  const canExport = canExportStream || canExportNet;
  const transitionFirings = actualMode.transitionFirings;
  const visibleFirings = transitionFirings.slice(-MAX_VISIBLE_EVENTS);
  const firstVisibleIndex = transitionFirings.length - visibleFirings.length;

  const handleExportStream = () => {
    if (!actualMode.available || !canExportStream) {
      return;
    }

    exportActualModeRecording({
      definition: actualMode.definition,
      initialState: actualMode.initialState,
      receivedEvents: actualMode.receivedEvents,
      source: actualMode.source,
      title: actualMode.title,
      transitionFirings,
    });
  };

  const handleExportNet = () => {
    if (!actualMode.available || actualMode.definition === null) {
      return;
    }

    exportSDCPN({
      petriNetDefinition: actualMode.definition,
      title: actualMode.title ?? "actual-mode-net",
    });
  };

  const exportMenuItems: MenuItem[] = [
    {
      id: "export-stream",
      text: "Export Stream",
      disabled: !canExportStream,
      onClick: handleExportStream,
    },
    {
      id: "export-net",
      text: "Export Net",
      disabled: !canExportNet,
      onClick: handleExportNet,
    },
  ];

  if (!actualMode.available) {
    return <span className={emptyStyle}>Actual mode is not available.</span>;
  }

  return (
    <div className={rootStyle}>
      <div className={toolbarStyle}>
        <div className={statusStyle}>
          <span>
            Status: <span className={countStyle}>{actualMode.status}</span>
          </span>
          <span>
            Events:{" "}
            <span className={countStyle}>{transitionFirings.length}</span>
          </span>
        </div>
        <Menu
          trigger={
            <Button
              variant="subtle"
              tone="neutral"
              size="xs"
              disabled={!canExport}
              suffix={
                <Icon
                  name="chevronDown"
                  size="xs"
                  className={exportChevronStyle}
                />
              }
            >
              Export
            </Button>
          }
          items={exportMenuItems}
          position="bottom"
        />
      </div>

      {visibleFirings.length === 0 ? (
        <span className={emptyStyle}>No transition events received yet.</span>
      ) : (
        <div className={tableWrapperStyle}>
          <table className={tableStyle}>
            <thead>
              <tr className={headerRowStyle}>
                <th
                  className={cx(
                    cellStyle,
                    singleLineCellStyle,
                    eventColumnStyle,
                  )}
                >
                  Event
                </th>
                <th
                  className={cx(
                    cellStyle,
                    singleLineCellStyle,
                    timestampColumnStyle,
                  )}
                >
                  Time
                </th>
                <th
                  className={cx(
                    cellStyle,
                    singleLineCellStyle,
                    transitionColumnStyle,
                  )}
                >
                  Transition
                </th>
                <th
                  className={cx(
                    cellStyle,
                    singleLineCellStyle,
                    effectColumnStyle,
                  )}
                >
                  Input
                </th>
                <th className={cx(cellStyle, singleLineCellStyle)}>Output</th>
              </tr>
            </thead>
            <tbody>
              {visibleFirings.map((firing, index) => (
                <EventRow
                  key={`${firstVisibleIndex + index}:${firing.ts}:${
                    firing.transitionId
                  }`}
                  firing={firing}
                  index={firstVisibleIndex + index}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {transitionFirings.length > MAX_VISIBLE_EVENTS && (
        <span className={footerNoteStyle}>
          Showing the latest {MAX_VISIBLE_EVENTS} events. Export includes the
          full stream.
        </span>
      )}
    </div>
  );
};

export const actualEventsSubView: SubView = {
  id: "actual-events",
  title: "Events",
  tooltip:
    "Inspect the Actual mode transition stream and export stream or net JSON.",
  component: ActualEventsContent,
};
