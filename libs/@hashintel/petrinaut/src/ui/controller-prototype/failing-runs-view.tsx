import { use, useEffect, useSyncExternalStore } from "react";

import { Button, Icon } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { useConstraints } from "../../react/controller-prototype/use-constraints";
import { EditorContext } from "../../react/state/editor-context";
import {
  EXAMPLE_DATA_NOTE,
  exampleFailingRuns,
  exampleResultFor,
} from "./constraint-results-example";

const listeners = new Set<() => void>();
let open = false;

const setOpen = (value: boolean) => {
  if (open === value) {
    return;
  }
  open = value;
  listeners.forEach((listener) => listener());
};

/** Shows the failing runs of the selected constraint over the canvas area. */
export const openFailingRuns = (): void => setOpen(true);

export const closeFailingRuns = (): void => setOpen(false);

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const visibleRows = 7;

const overlayStyle = css({
  position: "absolute",
  top: "0",
  zIndex: "[calc(var(--z-index-sticky) + 2)]",
  display: "flex",
  flexDirection: "column",
  gap: "3",
  padding: "6",
  paddingTop: "4",
  overflowY: "auto",
  backgroundColor: "neutral.s00",
  userSelect: "text",
});

const headerRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  minHeight: "[24px]",
});

const crumbsStyle = css({ fontSize: "sm", color: "neutral.s100" });

const crumbCurrentStyle = css({ fontWeight: "medium", color: "neutral.s120" });

const crumbSeparatorStyle = css({ marginX: "2" });

const exampleTagStyle = css({
  fontSize: "[11px]",
  lineHeight: "[16px]",
  fontWeight: "medium",
  color: "neutral.s100",
  backgroundColor: "neutral.s20",
  borderRadius: "md",
  paddingX: "1.5",
  flexShrink: 0,
  whiteSpace: "nowrap",
});

const filterRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "3",
  fontSize: "[13px]",
  color: "neutral.s100",
});

const filterChipStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1.5",
  height: "[26px]",
  paddingLeft: "2",
  paddingRight: "1",
  fontSize: "[13px]",
  color: "red.s100",
  backgroundColor: "red.s10",
  borderWidth: "thin",
  borderColor: "red.s40",
  borderRadius: "md",
  whiteSpace: "nowrap",
});

const removeStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[18px]",
  height: "[18px]",
  color: "red.s100",
  borderRadius: "sm",
  cursor: "pointer",
  _hover: { backgroundColor: "red.s20" },
});

const violatedChipStyle = css({
  display: "inline-block",
  fontSize: "xs",
  lineHeight: "[20px]",
  color: "red.s100",
  backgroundColor: "red.s20",
  borderRadius: "md",
  paddingX: "2",
});

const rowStyle = css({
  display: "grid",
  gridTemplateColumns:
    "[68px minmax(0, 200fr) minmax(0, 120fr) minmax(0, 110fr) minmax(104px, 175fr)]",
  alignItems: "center",
  columnGap: "3",
  minHeight: "[38px]",
  fontSize: "sm",
  color: "neutral.s120",
  borderBottomWidth: "thin",
  borderBottomColor: "neutral.s30",
});

const headingRowStyle = css({
  minHeight: "[34px]",
  fontSize: "xs",
  color: "neutral.s100",
  "& > *": {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

const linkStyle = css({
  justifySelf: "start",
  whiteSpace: "nowrap",
  "&&": {
    fontSize: "[13px]",
    fontWeight: "[400]",
    letterSpacing: "[0]",
    paddingInline: "[0]",
    color: "blue.s110",
  },
});

const moreStyle = css({
  fontSize: "[13px]",
  lineHeight: "[16px]",
  color: "neutral.s100",
});

/**
 * The failing runs of the selected constraint's last experiment, laid over
 * the canvas between the sidebar and the properties panel. Escape, the filter
 * chip's remove button, selecting anything but a constraint, or leaving the
 * canvas closes it.
 */
export const FailingRunsOverlay: React.FC = () => {
  const isOpen = useSyncExternalStore(
    subscribe,
    () => open,
    () => false,
  );
  const {
    selection,
    isLeftSidebarOpen,
    isSearchOpen,
    leftSidebarWidth,
    propertiesPanelWidth,
    isBottomPanelOpen,
    bottomPanelHeight,
    setGlobalMode,
  } = use(EditorContext);
  const { constraints } = useConstraints();

  const selected =
    selection.size === 1 ? Array.from(selection.values())[0] : undefined;
  const constraint =
    selected?.type === "constraint"
      ? constraints.find((candidate) => candidate.id === selected.id)
      : undefined;
  const result = constraint ? exampleResultFor(constraint.id) : undefined;
  const runs =
    constraint && result ? exampleFailingRuns(constraint, result) : [];
  const shown = isOpen && constraint && result && runs.length > 0;

  useEffect(() => {
    if (isOpen && !shown) {
      closeFailingRuns();
    }
  }, [isOpen, shown]);

  // Hiding the canvas (Simulate, Definitions) unmounts effects, so the view
  // does not come back on its own when the canvas does.
  useEffect(() => closeFailingRuns, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.stopPropagation();
        closeFailingRuns();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [isOpen]);

  if (!shown) {
    return null;
  }

  const rest = runs.length - visibleRows;

  return (
    <div
      className={overlayStyle}
      role="region"
      aria-label="Failing runs"
      style={{
        top: 1,
        left: isLeftSidebarOpen || isSearchOpen ? leftSidebarWidth + 1 : 0,
        right: propertiesPanelWidth + 1,
        bottom: isBottomPanelOpen ? bottomPanelHeight : 0,
      }}
    >
      <div className={headerRowStyle}>
        <span className={crumbsStyle}>
          Experiments{" "}
          <span aria-hidden className={crumbSeparatorStyle}>
            ›
          </span>
          <span className={crumbCurrentStyle}>{result.experiment}</span>
        </span>
        <span className={exampleTagStyle} title={EXAMPLE_DATA_NOTE}>
          Example data
        </span>
      </div>
      <div className={filterRowStyle}>
        <span className={filterChipStyle}>
          {constraint.name} · Violated
          <button
            type="button"
            className={removeStyle}
            aria-label="Remove"
            onClick={closeFailingRuns}
          >
            <Icon name="close" size="xs" />
          </button>
        </span>
        <span>
          {runs.length} of {result.runs} runs
        </span>
      </div>
      <div role="table" aria-label={`Runs that broke ${constraint.name}`}>
        <div role="row" className={cx(rowStyle, headingRowStyle)}>
          <span role="columnheader">Run</span>
          <span role="columnheader" title={constraint.name}>
            {constraint.name}
          </span>
          <span role="columnheader">First break</span>
          <span role="columnheader">Service level</span>
          <span />
        </div>
        {runs.slice(0, visibleRows).map((run) => (
          <div key={run.run} role="row" className={rowStyle}>
            <span role="cell">Run {run.run}</span>
            <span role="cell">
              <span className={violatedChipStyle}>Violated</span>
            </span>
            <span role="cell">day {run.day.toFixed(1)}</span>
            <span role="cell">{run.serviceLevel.toFixed(2)}</span>
            <span role="cell" className={linkStyle}>
              <Button
                size="sm"
                variant="link"
                tone="brand"
                className={linkStyle}
                onClick={() => {
                  closeFailingRuns();
                  setGlobalMode("simulate");
                }}
              >
                Open timeline ›
              </Button>
            </span>
          </div>
        ))}
        {rest > 0 ? (
          <div className={moreStyle} style={{ paddingTop: 2 }}>
            {rest} more runs
          </div>
        ) : null}
      </div>
    </div>
  );
};
