/**
 * A step's Outputs, as the 2 Nov sync settled (J2.51, J4.4):
 *
 * - A type icon left of each output's name (checklist for a choice, T for text, person for a reviewer).
 * - What depends on it, by name, as plain text: "Used in Alert to the team", or "Not used yet".
 * - The dependents as chips only while the row is hovered; a chip selects that step.
 * - Three names show; "+N more" lists the next ten on hover and shows all on click (Dei: there might be 50 or 100).
 * - An output no step reads offers "Use in a step" on hover, as Attio's Select next block does (4 Nov): it opens the
 *   step picker, and the step picked is added after this one, reading this output.
 * - A faint star at the row's end flags the output "Show in run history" (Ciarán, 4 Nov: "important output" is a flag
 *   on each output of each node). It shows on hover and stays when set; the History Outputs column lists the flagged
 *   outputs. Read-only in a run or a past version: a set star shows, nothing toggles.
 */
import { useState } from "react";

import { Chip, Icon, type IconName, Tooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  type EditorDocument,
  findStep,
  isOutputFlagged,
  stepLabel,
  toggleOutputFlag,
  usersOf,
} from "./document";
import { useEditor } from "./editor-context";
import { useRunView } from "./history-view";
import { useLocation } from "./router";
import { PropertyRow, SourceChip } from "./ui";
import { UsedInBlock, useOldUsedIn } from "./used-in";

import type { StepInputSource } from "./engine";

const shownUsers = 3;
const hoverUsers = 10;

/** The dependents line: plain text until the row is hovered, then the chips. */
const usedStyle = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "1",
  minWidth: "[0]",
  fontSize: "[13px]", // token-guard: allow Figma panel values beside labels are 13 px (J2.51)
  lineHeight: "[16px]",
  color: "neutral.fg.subtle",
});

const namesStyle = css({ "[data-row]:hover &": { display: "none" } });

const chipsStyle = css({
  display: "none",
  "[data-row]:hover &": { display: "contents" },
});

const emptyStyle = css({
  fontSize: "[13px]", // token-guard: allow Figma panel values beside labels are 13 px (J2.51)
  lineHeight: "[16px]",
  color: "neutral.fg.subtle",
});

/** "Not used yet" and its "Use in a step" share one cell, so the row keeps its height when the action shows. */
const unusedStyle = css({
  display: "grid",
  justifyItems: "start",
  alignItems: "center",
  "& > *": { gridArea: "1 / 1" },
  "& > [data-use]": { visibility: "hidden" },
  "[data-row]:hover &": {
    "& > [data-empty]": { visibility: "hidden" },
    "& > [data-use]": { visibility: "visible" },
  },
  "&[data-open]": {
    "& > [data-empty]": { visibility: "hidden" },
    "& > [data-use]": { visibility: "visible" },
  },
});

/** A ghost text button at the panel's control size (28 px, 14 px medium, 16 px icon), its icon on the text's start. */
const actionStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1.5",
  height: "[28px]",
  marginY: "[-6px]",
  marginLeft: "[-8px]",
  paddingX: "2",
  border: "none",
  borderRadius: "md",
  background: "[transparent]",
  cursor: "pointer",
  whiteSpace: "nowrap",
  textStyle: "sm",
  lineHeight: "[16px]",
  fontWeight: "medium",
  color: "neutral.fg.muted",
  _hover: {
    backgroundColor: "neutral.bg.surface.hover",
    color: "neutral.fg.heading",
  },
  "[data-open] > &": {
    backgroundColor: "neutral.bg.surface.hover",
    color: "neutral.fg.heading",
  },
});

const moreStyle = css({
  padding: "[0]",
  border: "none",
  background: "[transparent]",
  cursor: "pointer",
  textStyle: "xs",
  color: "neutral.fg.muted",
  _hover: { color: "neutral.fg.heading", textDecoration: "underline" },
});

const nameOf = (document: EditorDocument, id: string) => {
  const step = findStep(document, id)?.step;
  return step ? stepLabel(step) : id;
};

const UsedByTree = ({
  match,
  iconOf,
  action,
}: {
  match: (source: StepInputSource) => boolean;
  iconOf: (id: string) => IconName;
  /** The "Use in a step" action, when the flow can be edited. */
  action?: { anchor: string; open: boolean; onOpen: () => void };
}) => {
  const { document, ui, setUi } = useEditor();
  const [all, setAll] = useState(false);
  const users = usersOf(document, match);
  if (users.length === 0) {
    return action ? (
      <span className={unusedStyle} data-open={action.open || undefined}>
        <span className={emptyStyle} data-empty>
          Not used yet
        </span>
        <button
          type="button"
          className={actionStyle}
          data-use
          data-output-use={action.anchor}
          onClick={action.onOpen}
        >
          <Icon name="plus" size="sm" />
          Use in a step
        </button>
      </span>
    ) : (
      <span className={emptyStyle}>Not used yet</span>
    );
  }
  const withIcons = ui.outputIcons !== false;
  const shown = all ? users : users.slice(0, shownUsers);
  const rest = users.slice(shownUsers);
  const select = (id: string) =>
    setUi((current) => ({ ...current, selectedId: id, openField: null }));
  const more =
    rest.length > 0 && !all ? (
      <Tooltip
        content={
          <span className={css({ display: "flex", flexDirection: "column" })}>
            {rest.slice(0, hoverUsers).map((id) => (
              <span key={id}>{nameOf(document, id)}</span>
            ))}
            {rest.length > hoverUsers ? (
              <span>and {rest.length - hoverUsers} more</span>
            ) : null}
          </span>
        }
      >
        <button
          type="button"
          className={moreStyle}
          onClick={() => setAll(true)}
        >
          +{rest.length} more
        </button>
      </Tooltip>
    ) : null;
  return (
    <div className={usedStyle}>
      <span className={namesStyle}>
        Used in {shown.map((id) => nameOf(document, id)).join(", ")}
      </span>
      <span className={chipsStyle}>
        {shown.map((id) =>
          withIcons ? (
            <SourceChip key={id} icon={iconOf(id)} onClick={() => select(id)}>
              {nameOf(document, id)}
            </SourceChip>
          ) : (
            <Chip key={id} size="md" onClick={() => select(id)}>
              {nameOf(document, id)}
            </Chip>
          ),
        )}
      </span>
      {more}
      {all && rest.length > 0 ? (
        <button
          type="button"
          className={moreStyle}
          onClick={() => setAll(false)}
        >
          Show less
        </button>
      ) : null}
    </div>
  );
};

/** The flag: a ghost square at the row's control size (28 px, as "Use in a step"), hidden until hovered, kept once set. */
const flagStyle = css({
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[28px]",
  height: "[28px]",
  marginY: "[-6px]",
  textStyle: "sm",
  fontWeight: "medium",
  padding: "[0]",
  border: "none",
  borderRadius: "md",
  background: "[transparent]",
  color: "neutral.fg.subtle",
  cursor: "pointer",
  visibility: "hidden",
  "[data-row]:hover &": { visibility: "visible" },
  "&[data-flagged]": { visibility: "visible", color: "neutral.fg.muted" },
  "&[data-flagged] svg": { fill: "[currentColor]" },
  _hover: {
    backgroundColor: "neutral.bg.surface.hover",
    color: "neutral.fg.heading",
  },
  "&[data-readonly]": {
    cursor: "default",
    _hover: { background: "[transparent]" },
  },
});

const OutputFlag = ({
  stepId,
  outputName,
  readOnly,
}: {
  stepId: string;
  outputName: string;
  readOnly: boolean;
}) => {
  const { document, setDocument } = useEditor();
  const flagged = isOutputFlagged(document, stepId, outputName);
  if (readOnly && !flagged) {
    return null;
  }
  return (
    <Tooltip content={readOnly ? "Shown in Logs" : "Show in Logs"}>
      <button
        type="button"
        className={flagStyle}
        aria-label="Show in Logs"
        aria-pressed={flagged}
        data-output-flag={`${stepId}.${outputName}`}
        data-flagged={flagged || undefined}
        data-readonly={readOnly || undefined}
        aria-disabled={readOnly || undefined}
        onClick={() =>
          readOnly
            ? undefined
            : setDocument((current) =>
                toggleOutputFlag(current, stepId, outputName),
              )
        }
      >
        <Icon name="star" size="sm" />
      </button>
    </Tooltip>
  );
};

/**
 * How a step's output is marked a flow output (inbox `picks/flow-output-mark`, open): ?flowoutput=1..5, URL only; no param
 * keeps today's star. 1 the star; 2 a quiet "Flow output" checkbox on the row; 3 the row's ⋯ menu, with a faint tag on a
 * flagged row; 4 a flow-level Outputs list (Flow outputs, at the end of the Steps tree); 5 an Outputs card on the canvas
 * after the last step. 4 and 5 show a flagged row's tag here, read-only.
 */
export type FlowOutputTake = 1 | 2 | 3 | 4 | 5;

export const useFlowOutputTake = (): FlowOutputTake | null => {
  const value = Number(useLocation().query.get("flowoutput"));
  return value >= 1 && value <= 5 ? (value as FlowOutputTake) : null;
};

/** The faint "Flow output" tag a flagged row carries in takes 3–5. */
const flowTagStyle = css({
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  height: "[18px]",
  paddingX: "1.5",
  borderRadius: "sm",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  textStyle: "xxs",
  lineHeight: "[16px]",
  color: "neutral.fg.subtle",
  whiteSpace: "nowrap",
});

export const FlowOutputTag = () => (
  <span className={flowTagStyle} data-flow-output-tag>
    Flow output
  </span>
);

/** Take 2: a quiet checkbox and its label, shown on hover, kept once checked. */
const flowCheckStyle = css({
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  gap: "1.5",
  height: "[28px]",
  marginY: "[-6px]",
  paddingX: "1.5",
  borderRadius: "md",
  cursor: "pointer",
  textStyle: "xs",
  color: "neutral.fg.subtle",
  whiteSpace: "nowrap",
  visibility: "hidden",
  "[data-row]:hover &": { visibility: "visible" },
  "&[data-flagged]": { visibility: "visible", color: "neutral.fg.muted" },
  _hover: { backgroundColor: "neutral.bg.surface.hover" },
  "& input": {
    width: "[12px]",
    height: "[12px]",
    margin: "[0]",
    accentColor: "[var(--colors-neutral-s110)]",
    cursor: "pointer",
  },
});

const FlowOutputCheck = ({
  stepId,
  outputName,
}: {
  stepId: string;
  outputName: string;
}) => {
  const { document, setDocument } = useEditor();
  const flagged = isOutputFlagged(document, stepId, outputName);
  return (
    <label
      className={flowCheckStyle}
      data-flagged={flagged || undefined}
      data-output-flag={`${stepId}.${outputName}`}
    >
      <input
        type="checkbox"
        checked={flagged}
        onChange={() =>
          setDocument((current) =>
            toggleOutputFlag(current, stepId, outputName),
          )
        }
      />
      Flow output
    </label>
  );
};

/** Take 3: the row's ⋯, with one item, drawn in place under it. */
const rowMenuStyle = css({
  position: "relative",
  flexShrink: 0,
});

const rowMenuButtonStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[28px]",
  height: "[28px]",
  marginY: "[-6px]",
  padding: "[0]",
  border: "none",
  borderRadius: "md",
  background: "[transparent]",
  color: "neutral.fg.subtle",
  cursor: "pointer",
  visibility: "hidden",
  "[data-row]:hover &": { visibility: "visible" },
  "&[data-open]": { visibility: "visible" },
  _hover: {
    backgroundColor: "neutral.bg.surface.hover",
    color: "neutral.fg.heading",
  },
});

const rowMenuListStyle = css({
  position: "absolute",
  top: "[26px]",
  right: "[0]",
  zIndex: "[20]",
  minWidth: "[188px]",
  padding: "1",
  borderRadius: "lg",
  backgroundColor: "neutral.s00",
  boxShadow: "md",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
});

const rowMenuItemStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  width: "[100%]",
  height: "[32px]",
  paddingX: "2",
  border: "none",
  borderRadius: "md",
  background: "[transparent]",
  cursor: "pointer",
  textStyle: "sm",
  color: "neutral.fg.heading",
  whiteSpace: "nowrap",
  _hover: { backgroundColor: "neutral.bg.surface.hover" },
  "& svg": { color: "neutral.fg.subtle" },
});

const FlowOutputMenu = ({
  stepId,
  outputName,
}: {
  stepId: string;
  outputName: string;
}) => {
  const { document, setDocument } = useEditor();
  const [open, setOpen] = useState(false);
  const flagged = isOutputFlagged(document, stepId, outputName);
  return (
    <span className={rowMenuStyle}>
      <button
        type="button"
        className={rowMenuButtonStyle}
        aria-label="Output actions"
        data-open={open || undefined}
        data-output-menu={`${stepId}.${outputName}`}
        onClick={() => setOpen((current) => !current)}
      >
        <Icon name="ellipsis" size="sm" />
      </button>
      {open ? (
        <span className={rowMenuListStyle} role="menu">
          <button
            type="button"
            role="menuitem"
            className={rowMenuItemStyle}
            onClick={() => {
              setDocument((current) =>
                toggleOutputFlag(current, stepId, outputName),
              );
              setOpen(false);
            }}
          >
            <Icon name="rightToLine" size="sm" />
            {flagged ? "Remove from flow outputs" : "Mark as flow output"}
          </button>
        </span>
      ) : null}
    </span>
  );
};

/** An output's type as the icon left of its name (2 Nov): its kind decides it. */
export const kindIcon = (kind: string | null): IconName => {
  const name = (kind ?? "").replace(/^List of /, "");
  const list = kind?.startsWith("List of ") ?? false;
  if (/entity/i.test(name)) {
    return list ? "cubes" : "cube";
  }
  if (/date|time/i.test(name)) {
    return "calendar";
  }
  if (/number|integer/i.test(name)) {
    return "oneHundred";
  }
  if (/boolean|choice|decision/i.test(name)) {
    return "list";
  }
  if (/person|user|actor/i.test(name)) {
    return "user";
  }
  if (/file/i.test(name)) {
    return "file";
  }
  return list ? "list" : "text";
};

/** The outputs one under another, 24 px apart (playground spacing 40 / 36 / 24), across both panel columns. */
const outputsStackStyle = css({
  gridColumn: "1 / -1",
  display: "flex",
  flexDirection: "column",
  gap: "6",
});

export const OutputRows = ({
  stepId,
  outputs,
  kindOf,
  iconOf,
}: {
  stepId: string;
  outputs: { name: string; label: string }[];
  /** The output's kind as a label, or `null` when it is known only when the flow runs. */
  kindOf: (outputName: string) => string | null;
  iconOf: (id: string) => IconName;
}) => {
  const { document, ui, setUi } = useEditor();
  // A run, or a past version, is read-only: nothing is added from it.
  const runView = useRunView();
  const viewingVersion = useLocation().query.has("version");
  const readOnly = Boolean(runView) || viewingVersion || !!ui.run;
  const take = useFlowOutputTake();
  const oldUsedIn = useOldUsedIn();
  if (!oldUsedIn) {
    return (
      <div className={outputsStackStyle}>
        {outputs.map((output) => {
          const kind = kindOf(output.name);
          return (
            <UsedInBlock
              key={output.name}
              stepId={stepId}
              outputName={output.name}
              label={output.label}
              kind={kind}
              typeIcon={kindIcon(kind)}
              readOnly={readOnly}
              iconOf={iconOf}
              end={
                <>
                  {take !== null &&
                  take >= 3 &&
                  isOutputFlagged(document, stepId, output.name) ? (
                    <FlowOutputTag />
                  ) : null}
                  {take === 2 && !readOnly ? (
                    <FlowOutputCheck stepId={stepId} outputName={output.name} />
                  ) : take === 3 && !readOnly ? (
                    <FlowOutputMenu stepId={stepId} outputName={output.name} />
                  ) : take === 4 || take === 5 ? null : (
                    <OutputFlag
                      stepId={stepId}
                      outputName={output.name}
                      readOnly={readOnly}
                    />
                  )}
                </>
              }
            />
          );
        })}
      </div>
    );
  }
  return (
    <>
      {outputs.map((output) => {
        const kind = kindOf(output.name);
        const open =
          ui.picker?.anchor === "output" &&
          ui.picker.after?.stepId === stepId &&
          ui.picker.feed?.outputName === output.name;
        return (
          <PropertyRow
            key={output.name}
            label={
              // A flex row that can shrink, so a long name ends in an ellipsis instead of being cut off (an
              // inline-flex child never takes the key's ellipsis). The full name is in the hover.
              <span
                className={css({
                  display: "flex",
                  alignItems: "center",
                  gap: "1",
                  minWidth: "[0]",
                })}
              >
                <span className={css({ display: "flex", flexShrink: 0 })}>
                  <Icon name={kindIcon(kind)} size="sm" />
                </span>
                <span
                  className={css({
                    minWidth: "[0]",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  })}
                >
                  {output.label}
                </span>
              </span>
            }
            hover={`${output.label} · ${kind ?? "Kind is known when it runs"}`}
          >
            <span
              className={css({
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "2",
                minWidth: "[0]",
              })}
            >
              <span
                className={css({
                  display: "flex",
                  alignItems: "center",
                  gap: "2",
                  minWidth: "[0]",
                })}
              >
                {take !== null &&
                take >= 3 &&
                isOutputFlagged(document, stepId, output.name) ? (
                  <FlowOutputTag />
                ) : null}
                <UsedByTree
                  iconOf={iconOf}
                  action={
                    readOnly
                      ? undefined
                      : {
                          anchor: `${stepId}:${output.name}`,
                          open,
                          onOpen: () =>
                            setUi((current) => ({
                              ...current,
                              openField: null,
                              picker: {
                                anchor: "output",
                                after: { stepId, port: "next" },
                                feed: {
                                  outputName: output.name,
                                  label: output.label,
                                },
                              },
                            })),
                        }
                  }
                  match={(source) =>
                    source.kind === "step-output" &&
                    source.stepId === stepId &&
                    source.outputName === output.name
                  }
                />
              </span>
              {take === 2 && !readOnly ? (
                <FlowOutputCheck stepId={stepId} outputName={output.name} />
              ) : take === 3 && !readOnly ? (
                <FlowOutputMenu stepId={stepId} outputName={output.name} />
              ) : take === 4 || take === 5 ? null : (
                <OutputFlag
                  stepId={stepId}
                  outputName={output.name}
                  readOnly={readOnly}
                />
              )}
            </span>
          </PropertyRow>
        );
      })}
    </>
  );
};
