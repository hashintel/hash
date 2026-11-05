/**
 * A step's Outputs as the outputs playground settled them (ops decisions ledger, 5 Nov; playground v25–v26, crop
 * `screenshots/outputs-rw-1105/link-K3-vertical.png`):
 *
 * - Each output is a full-width row: its type icon, its name, and the flow-output star on hover (M1).
 * - Under it, a tree of the later steps that use it, one row per step (T1): the loops the step sits in on a faint
 *   12 px line, parent first, the middle folded to ⋯ until the row is hovered; then the step's tile and name at
 *   14 px; then the inputs it fills at 12 px. Only › joins names. A faint vertical line joins the three lines through
 *   the step's tile (K3).
 * - Which part of the output goes in is left out (Q1).
 * - The last row of every tree is "Use in a step", which opens the later-steps menu (W1): the inputs of later steps
 *   that take this value, each with its step under it. Picking one connects it.
 *
 * `?usedin=old` keeps the rows from before (label column, "Used in …" text, chips on hover).
 */
import { useRef, useState } from "react";

import { Icon, type IconName, type MenuItem, Tooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { getCatalogEntry, humanize } from "./catalog";
import {
  type EditorDocument,
  findStep,
  flattenSteps,
  setInputSource,
  stepLabel,
} from "./document";
import { useEditor } from "./editor-context";
import { tileMenu, tiledRowsStyle } from "./menu-rows";
import { OpenMenu } from "./open-menu";
import { useLocation } from "./router";
import { sourceOptions } from "./shapes";
import { tileColor } from "./status-colors";
import { kindLabel } from "./ui";

import type { StepInputSource } from "./engine";

export const useOldUsedIn = () => useLocation().query.get("usedin") === "old";

type Use = { stepId: string; inputs: string[] };

const sameOutput =
  (stepId: string, outputName: string) => (source: StepInputSource | undefined) =>
    source?.kind === "step-output" &&
    source.stepId === stepId &&
    source.outputName === outputName;

const inputLabel = (document: EditorDocument, stepId: string, name: string) => {
  const step = findStep(document, stepId)?.step;
  const entry =
    step?.kind === "action" ? getCatalogEntry(step.actionDefinitionId) : undefined;
  return entry?.inputs.find((input) => input.name === name)?.label ?? humanize(name);
};

/** The steps that read an output, in flow order, each with the inputs it fills by their real names. */
export const usesOf = (
  document: EditorDocument,
  stepId: string,
  outputName: string,
): Use[] => {
  const match = sameOutput(stepId, outputName);
  const byStep = new Map<string, Set<string>>();
  const add = (userId: string, input: string) => {
    const inputs = byStep.get(userId) ?? new Set<string>();
    inputs.add(input);
    byStep.set(userId, inputs);
  };
  for (const { step } of flattenSteps(document.steps)) {
    if (step.kind === "action") {
      for (const [name, source] of Object.entries(step.inputs)) {
        if (match(source)) {
          add(step.stepId, inputLabel(document, step.stepId, name));
        }
      }
    } else if (match(step.over)) {
      add(step.stepId, "List");
    }
  }
  const keyed = (key: string) => {
    const [userId = "", name = ""] = key.split(".");
    return { userId, label: inputLabel(document, userId, name) };
  };
  for (const [key, parts] of Object.entries(document.templates)) {
    if (parts.some((part) => part.kind === "ref" && match(part.source))) {
      const { userId, label } = keyed(key);
      add(userId, label);
    }
  }
  for (const [key, items] of Object.entries(document.lists)) {
    if (items.some(match)) {
      const { userId, label } = keyed(key);
      add(userId, label);
    }
  }
  for (const [userId, patches] of Object.entries(document.patches)) {
    if (patches.some((patch) => match(patch.source ?? undefined))) {
      add(userId, "Changes");
    }
  }
  const order = flattenSteps(document.steps).map(({ step }) => step.stepId);
  return [...byStep.entries()]
    .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
    .map(([userId, inputs]) => ({ stepId: userId, inputs: [...inputs] }));
};

/** The For each steps a step sits in, outermost first. */
const loopsOf = (document: EditorDocument, stepId: string): string[] => {
  const loops: string[] = [];
  let parentId = findStep(document, stepId)?.parentId ?? null;
  while (parentId) {
    const found = findStep(document, parentId);
    if (!found) {
      break;
    }
    loops.unshift(stepLabel(found.step));
    parentId = found.parentId;
  }
  return loops;
};

/** Faint connector colour: the playground's 12 % wire for the tree, 18 % for the K3 line. */
const treeWire = "neutral.a20";
const k3Wire = "neutral.a25";

const blockStyle = css({
  gridColumn: "1 / -1",
  display: "flex",
  flexDirection: "column",
  minWidth: "[0]",
});

/** An output's own row: 40 px, 8 px in, its 16 px type icon 10 px from the name (playground spacing 40 / 36 / 24). */
const headStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[10px]",
  minHeight: "[40px]",
  paddingX: "2",
  borderRadius: "lg",
  minWidth: "[0]",
  textStyle: "sm",
  lineHeight: "[20px]",
  color: "neutral.fg.heading",
  "& > [data-type-icon]": { display: "flex", flexShrink: 0, color: "neutral.fg.muted" },
});

const headNameStyle = css({
  flex: "1",
  minWidth: "[0]",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const headEndStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  flexShrink: 0,
  marginLeft: "auto",
});

const treeStyle = css({
  display: "flex",
  flexDirection: "column",
  marginTop: "1",
});

/**
 * One tree row, 36 px in: the trunk at 15.5 px (under the output's icon) and an elbow to the step line. The elbow
 * meets the step's line, so a row with a loop line has it 18 px lower.
 */
const useRowStyle = css({
  "--elbow": "18px",
  position: "relative",
  display: "flex",
  paddingLeft: "[36px]",
  paddingY: "1",
  "&[data-loops]": { "--elbow": "36px" },
  "&::before": {
    content: '""',
    position: "absolute",
    left: "[15.5px]",
    top: "[0]",
    bottom: "[0]",
    width: "[1px]",
    backgroundColor: treeWire,
  },
  "&[data-first]::before": { top: "[-4px]" },
  "&[data-last]::before": { bottom: "auto", height: "var(--elbow)" },
  "&[data-first][data-last]::before": { height: "calc(var(--elbow) + 4px)" },
  "&::after": {
    content: '""',
    position: "absolute",
    left: "[15.5px]",
    top: "var(--elbow)",
    width: "[16px]",
    height: "[1px]",
    backgroundColor: treeWire,
  },
});

const linkStyle = css({
  flex: "1",
  minWidth: "[0]",
  display: "flex",
  flexDirection: "column",
  paddingX: "1.5",
  paddingY: "1",
  border: "none",
  borderRadius: "md",
  background: "[transparent]",
  textAlign: "left",
  cursor: "pointer",
  color: "neutral.fg.muted",
  _hover: { backgroundColor: "neutral.bg.surface.hover" },
  _focusVisible: { backgroundColor: "neutral.bg.surface.hover", outline: "none" },
});

const sepStyle = css({ color: "neutral.fg.subtle", paddingX: "1.5" });

/** The loops line and the inputs line: 12 / 16 px, faint, 22 px in, joined to the tile by the K3 line. */
const smallLine = {
  position: "relative",
  paddingLeft: "[22px]",
  textStyle: "xs",
  lineHeight: "[16px]",
  color: "neutral.fg.subtle",
  overflowWrap: "normal",
  "& [data-name]": { whiteSpace: "nowrap" },
  "&::after": {
    content: '""',
    position: "absolute",
    left: "[7px]",
    top: "[8px]",
    width: "[9px]",
    height: "[1px]",
    backgroundColor: k3Wire,
  },
} as const;

const loopsLineStyle = css({
  ...smallLine,
  marginBottom: "[2px]",
  "&::before": {
    content: '""',
    position: "absolute",
    left: "[7px]",
    top: "[8px]",
    // Down to the top of the step's tile: 2 px gap, then 3 px of the 20 px line above the 14 px tile.
    bottom: "[-5px]",
    width: "[1px]",
    backgroundColor: k3Wire,
  },
  "& [data-full]": { display: "none" },
  "[data-use]:hover &, [data-use]:focus-within &": {
    "& [data-full]": { display: "inline" },
    "& [data-dots]": { display: "none" },
  },
});

const inputsLineStyle = css({
  ...smallLine,
  marginTop: "[2px]",
  "&::before": {
    content: '""',
    position: "absolute",
    left: "[7px]",
    // Up to the bottom of the step's tile.
    top: "[-5px]",
    height: "[13px]",
    width: "[1px]",
    backgroundColor: k3Wire,
  },
  "& > span": { display: "block" },
});

/** The step line: its 14 px tile inline, 8 px to the name, a wrapped line starting under the name. */
const stepLineStyle = css({
  paddingLeft: "[22px]",
  textIndent: "[-22px]",
  textStyle: "sm",
  lineHeight: "[20px]",
  color: "neutral.fg.heading",
});

const stepTileStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[14px]",
  height: "[14px]",
  marginRight: "2",
  borderRadius: "[3px]",
  verticalAlign: "[-2px]",
  textIndent: "[0]",
  "& svg": { width: "[10px]", height: "[10px]" },
});

const Names = ({ names }: { names: string[] }) => (
  <>
    {names.map((name, index) => (
      <span key={`${name}-${String(index)}`}>
        {index > 0 ? <span className={sepStyle}>›</span> : null}
        <wbr />
        <span data-name>{name}</span>
      </span>
    ))}
  </>
);

/** A loop path longer than two keeps its first and last and folds the middle to ⋯; hovering the row shows it all. */
const LoopPath = ({ loops }: { loops: string[] }) => {
  if (loops.length <= 2) {
    return <Names names={loops} />;
  }
  return (
    <>
      <span data-name>{loops[0]}</span>
      <span className={sepStyle}>›</span>
      <span data-dots>⋯</span>
      <span data-full>
        <Names names={loops.slice(1, -1)} />
      </span>
      <span className={sepStyle}>›</span>
      <wbr />
      <span data-name>{loops[loops.length - 1]}</span>
    </>
  );
};

const addRowStyle = css({
  position: "relative",
  display: "flex",
  paddingLeft: "[36px]",
  "&::before": {
    content: '""',
    position: "absolute",
    left: "[15.5px]",
    top: "[0]",
    height: "[18px]",
    width: "[1px]",
    backgroundColor: treeWire,
  },
  "&[data-first]::before": { top: "[-4px]", height: "[22px]" },
  "&::after": {
    content: '""',
    position: "absolute",
    left: "[15.5px]",
    top: "[18px]",
    width: "[16px]",
    height: "[1px]",
    backgroundColor: treeWire,
  },
});

const addStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "2",
  height: "[36px]",
  paddingX: "1.5",
  border: "none",
  borderRadius: "md",
  background: "[transparent]",
  cursor: "pointer",
  textStyle: "sm",
  lineHeight: "[20px]",
  color: "neutral.fg.subtle",
  _hover: { color: "neutral.fg.heading", backgroundColor: "neutral.bg.surface.hover" },
  "&[data-open]": { color: "neutral.fg.heading", backgroundColor: "neutral.bg.surface.hover" },
  "& > svg": { width: "[14px !important]", height: "[14px !important]" },
});

const menuWidthStyle = css({ "&[class]": { minWidth: "[260px]" }, maxWidth: "[380px]" });

const typeSuffixStyle = css({
  flexShrink: 0,
  marginLeft: "auto",
  paddingLeft: "3",
  textStyle: "xs",
  color: "neutral.fg.subtle",
});

/**
 * The later-steps menu (W1): every input of a later step that can take this output, as the @ menu (X) turned
 * around. Rows: the input's name, its step under it on the step's tile, its type on the right.
 */
const LaterStepsMenu = ({
  anchor,
  stepId,
  outputName,
  onClose,
}: {
  anchor: React.RefObject<Element | null>;
  stepId: string;
  outputName: string;
  onClose: () => void;
}) => {
  const { document, setDocument } = useEditor();
  const order = flattenSteps(document.steps);
  const from = order.findIndex(({ step }) => step.stepId === stepId);
  const match = sameOutput(stepId, outputName);
  const items: MenuItem[] = order.slice(from + 1).flatMap(({ step }) => {
    if (step.kind !== "action") {
      return [];
    }
    const entry = getCatalogEntry(step.actionDefinitionId);
    if (!entry) {
      return [];
    }
    return entry.inputs.flatMap((input) => {
      const option = sourceOptions(document, step.stepId, input, entry).find(
        (candidate) => match(candidate.source),
      );
      if (!option) {
        return [];
      }
      const key = `${step.stepId}.${input.name}`;
      const filled =
        match(step.inputs[input.name]) ||
        (document.templates[key]?.some(
          (part) => part.kind === "ref" && match(part.source),
        ) ??
          false) ||
        (document.lists[key]?.some(match) ?? false);
      const kind = input.kinds?.[0];
      return [
        {
          id: key,
          text: input.label,
          description: stepLabel(step),
          icon: entry.icon as IconName,
          selected: filled,
          selectedStyle: "tick" as const,
          suffix: kind ? (
            <span className={typeSuffixStyle}>{kindLabel(kind, input.array)}</span>
          ) : undefined,
          onClick: () => {
            setDocument((current) => {
              if (current.templates[key]) {
                return {
                  ...current,
                  templates: {
                    ...current.templates,
                    [key]: [...current.templates[key], { kind: "ref", source: option.source as never }],
                  },
                };
              }
              if (current.lists[key]) {
                return {
                  ...current,
                  lists: { ...current.lists, [key]: [...current.lists[key], option.source] },
                };
              }
              return setInputSource(current, step.stepId, input.name, option.source);
            });
            onClose();
          },
        },
      ];
    });
  });
  return (
    <OpenMenu
      anchor={anchor}
      position="bottom-start"
      onClose={onClose}
      label="Use in a step"
      className={`${menuWidthStyle} ${tiledRowsStyle}`}
      items={tileMenu([
        {
          id: "later",
          label: "Later steps",
          items:
            items.length > 0
              ? items
              : [{ id: "none", text: "No later step takes it", disabled: true }],
        },
      ])}
    />
  );
};

const AddRow = ({
  stepId,
  outputName,
  first,
}: {
  stepId: string;
  outputName: string;
  first: boolean;
}) => {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <div className={addRowStyle} data-first={first || undefined}>
      <button
        ref={anchor}
        type="button"
        className={addStyle}
        data-open={open || undefined}
        data-output-use={`${stepId}:${outputName}`}
        onClick={() => setOpen((current) => !current)}
      >
        <Icon name="plus" size="sm" />
        Use in a step
      </button>
      {open ? (
        <LaterStepsMenu
          anchor={anchor}
          stepId={stepId}
          outputName={outputName}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
};

export const UsedInBlock = ({
  stepId,
  outputName,
  label,
  kind,
  typeIcon,
  readOnly,
  iconOf,
  end,
}: {
  stepId: string;
  outputName: string;
  label: string;
  kind: string | null;
  typeIcon: IconName;
  readOnly: boolean;
  iconOf: (id: string) => IconName;
  /** The row's end: the flow-output star (M1). */
  end: React.ReactNode;
}) => {
  const { document, setUi } = useEditor();
  const uses = usesOf(document, stepId, outputName);
  const rows = uses.length + (readOnly ? 0 : 1);
  const select = (id: string) =>
    setUi((current) => ({ ...current, selectedId: id, openField: null }));
  return (
    <div className={blockStyle} data-output={`${stepId}.${outputName}`}>
      <div className={headStyle} data-row>
        <span data-type-icon>
          <Icon name={typeIcon} size="sm" />
        </span>
        <Tooltip content={`${label} · ${kind ?? "Kind is known when it runs"}`} position="top">
          <span className={headNameStyle}>{label}</span>
        </Tooltip>
        <span className={headEndStyle}>{end}</span>
      </div>
      {rows > 0 ? (
        <div className={treeStyle}>
          {uses.map((use, index) => {
            const loops = loopsOf(document, use.stepId);
            const icon = iconOf(use.stepId);
            const step = findStep(document, use.stepId)?.step;
            return (
              <div
                key={use.stepId}
                className={useRowStyle}
                data-use
                data-first={index === 0 || undefined}
                data-last={index === rows - 1 || undefined}
                data-loops={loops.length > 0 || undefined}
              >
                <button
                  type="button"
                  className={linkStyle}
                  title={[...loops, step ? stepLabel(step) : use.stepId].join(" › ")}
                  onClick={() => select(use.stepId)}
                >
                  {loops.length > 0 ? (
                    <span className={loopsLineStyle}>
                      <LoopPath loops={loops} />
                    </span>
                  ) : null}
                  <span className={stepLineStyle}>
                    <span className={stepTileStyle} style={tileColor(icon)}>
                      <Icon name={icon} size="sm" />
                    </span>
                    {step ? stepLabel(step) : use.stepId}
                  </span>
                  <span className={inputsLineStyle}>
                    {use.inputs.map((input) => (
                      <span key={input}>{input}</span>
                    ))}
                  </span>
                </button>
              </div>
            );
          })}
          {readOnly ? null : (
            <AddRow stepId={stepId} outputName={outputName} first={uses.length === 0} />
          )}
        </div>
      ) : null}
    </div>
  );
};
