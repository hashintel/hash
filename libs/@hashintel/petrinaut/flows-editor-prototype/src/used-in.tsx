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
 * - Hovering a using step shows ⋮ (its inputs that take the value, the filled one ticked; picking another moves it;
 *   Open step) and × (stop using it there). Inbox output-used-in, spec E13.
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
  mapSteps,
  type RefSource,
  setInputSource,
  stepLabel,
} from "./document";
import { useEditor } from "./editor-context";
import { type TiledItem, tileMenu, tiledRowsStyle } from "./menu-rows";
import { OpenMenu } from "./open-menu";
import { useLocation } from "./router";
import { sourceOptions } from "./shapes";
import { SearchHeader } from "./source-menu";
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

/**
 * The playground's step tile colours (`.k-action`, `.k-orange`, `.k-start`): action steps green s20 / s100, Fetch file,
 * If and Ask a person orange s20 / s100, Start blue s20 with a neutral s100 icon.
 */
const kTile = (document: EditorDocument, id: string): React.CSSProperties => {
  const step = findStep(document, id)?.step;
  const tone =
    step?.kind === "action" ? getCatalogEntry(step.actionDefinitionId)?.tone : undefined;
  return tone === "orange"
    ? { backgroundColor: "var(--colors-orange-s20)", color: "var(--colors-orange-s100)" }
    : step
      ? { backgroundColor: "var(--colors-green-s20)", color: "var(--colors-green-s100)" }
      : { backgroundColor: "var(--colors-blue-s20)", color: "var(--colors-neutral-s100)" };
};

/** Faint connector colour: the playground's 12 % wire for the tree, 18 % for the K3 line. */
// token-guard: allow the playground's exact alphas; no DS step is .12 or .18 (a20 .10, a25 .125, a35 .176).
const treeWire = "[rgba(0, 0, 0, 0.12)]";
const k3Wire = "[rgba(0, 0, 0, 0.18)]";

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
  "& > [data-type-icon]": { display: "flex", flexShrink: 0, color: "neutral.fg.heading" },
});

const headNameStyle = css({
  display: "block",
  minWidth: "[0]",
  lineHeight: "[20px]",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

/** The output's type as a chip after its name (playground `.tb`): 16 px, 4 px in, 4 px corners, faint fill, 12 px muted. */
const typeChipStyle = css({
  display: "inline-flex",
  alignItems: "center",
  flexShrink: 0,
  height: "[16px]",
  paddingX: "1",
  borderRadius: "sm",
  backgroundColor: "neutral.a10",
  textStyle: "xs",
  lineHeight: "[16px]",
  color: "neutral.fg.muted",
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
    bottom: "[-2px]",
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
    top: "[0]",
    height: "[8px]",
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
  // The playground K3 value (outputs playground v26 `.lt.tk .t1 .st`), ported as is.
  verticalAlign: "[-2px]",
  textIndent: "[0]",
  "& svg": {
    width: "[10px !important]",
    minWidth: "[10px]",
    maxWidth: "[10px]",
    height: "[10px !important]",
  },
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
  flex: "1",
  gap: "2",
  height: "[28px]",
  marginY: "1",
  paddingX: "1.5",
  border: "none",
  borderRadius: "md",
  background: "[transparent]",
  cursor: "pointer",
  textStyle: "sm",
  lineHeight: "[20px]",
  color: "neutral.fg.muted",
  // Playground `.add .link`: 70 % until hovered.
  opacity: "[0.7]",
  _hover: { opacity: "[1]", color: "neutral.fg.heading", backgroundColor: "neutral.bg.surface.hover" },
  "&[data-open]": { opacity: "[1]", color: "neutral.fg.heading", backgroundColor: "neutral.bg.surface.hover" },
  "& > svg": { width: "[16px !important]", height: "[16px !important]" },
});

/** Playground `.xr .xd`: a later-steps row's second line (its step) is muted, not subtle. */
const laterMenuStyle = css({
  // Playground `wide`: the menu spans the panel's content width.
  "&[class]": { width: "[352px]", minWidth: "[352px]", maxWidth: "[352px]" },
  "& [data-menu-row=two] > span:last-child > span:last-child": { color: "neutral.fg.muted" },
});

/** The input's type in words, as the playground's menu shows it: "Email", "URL", "File", an entity type, or the kind. */
const typeWords = (input: {
  format?: string;
  entityTypeTitle?: string;
  kinds: readonly string[] | null;
}) => {
  if (input.format === "email") {
    return "Email";
  }
  if (input.format === "url") {
    return "URL";
  }
  if (input.format === "file") {
    return "File";
  }
  if (input.entityTypeTitle) {
    return input.entityTypeTitle;
  }
  return kindLabel(input.kinds?.[0], false);
};

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
/** Connects `source` to a step's input: one more reference in a free-text or list field, else the input's value. */
const connect = (
  document: EditorDocument,
  userId: string,
  inputName: string,
  source: StepInputSource,
): EditorDocument => {
  const key = `${userId}.${inputName}`;
  const parts = document.templates[key];
  if (parts) {
    return {
      ...document,
      templates: {
        ...document.templates,
        [key]: [...parts, { kind: "ref", source: source as RefSource }],
      },
    };
  }
  const items = document.lists[key];
  if (items) {
    return { ...document, lists: { ...document.lists, [key]: [...items, source] } };
  }
  return setInputSource(document, userId, inputName, source);
};

/** Takes an output out of one step: every input, free-text reference, list item and change that reads it. */
const disconnect = (
  document: EditorDocument,
  userId: string,
  match: (source: StepInputSource | undefined) => boolean,
  only?: string,
): EditorDocument => {
  const mine = (key: string) =>
    key.split(".")[0] === userId && (!only || key.split(".")[1] === only);
  const steps = mapSteps(document.steps, (step) => {
    if (step.stepId !== userId) {
      return step;
    }
    if (step.kind === "for-each") {
      return only || !match(step.over) ? step : { ...step, over: undefined };
    }
    const inputs = Object.fromEntries(
      Object.entries(step.inputs).filter(
        ([name, source]) => !(match(source) && (!only || name === only)),
      ),
    );
    return { ...step, inputs };
  });
  const templates = Object.fromEntries(
    Object.entries(document.templates).map(([key, parts]) => [
      key,
      mine(key)
        ? parts.filter((part) => !(part.kind === "ref" && match(part.source)))
        : parts,
    ]),
  );
  const lists = Object.fromEntries(
    Object.entries(document.lists).map(([key, items]) => [
      key,
      mine(key) ? items.filter((item) => !match(item)) : items,
    ]),
  );
  const patches = only
    ? document.patches
    : Object.fromEntries(
        Object.entries(document.patches).map(([id, list]) => [
          id,
          id === userId
            ? list.map((patch) =>
                match(patch.source ?? undefined) ? { ...patch, source: null } : patch,
              )
            : list,
        ]),
      );
  return { ...document, steps, templates, lists, patches };
};

/** A step's inputs that can take the output, each with the source to connect and whether it already reads it. */
const inputsTaking = (
  document: EditorDocument,
  userId: string,
  match: (source: StepInputSource | undefined) => boolean,
) => {
  const step = findStep(document, userId)?.step;
  const entry =
    step?.kind === "action" ? getCatalogEntry(step.actionDefinitionId) : undefined;
  if (step?.kind !== "action" || !entry) {
    return [];
  }
  return entry.inputs.flatMap((input) => {
    const option = sourceOptions(document, userId, input, entry).find((candidate) =>
      match(candidate.source),
    );
    if (!option) {
      return [];
    }
    const key = `${userId}.${input.name}`;
    const filled =
      match(step.inputs[input.name]) ||
      (document.templates[key]?.some(
        (part) => part.kind === "ref" && match(part.source),
      ) ??
        false) ||
      (document.lists[key]?.some(match) ?? false);
    return [{ step, entry, input, source: option.source, filled }];
  });
};

const typeSuffix = (kinds: readonly string[] | null, array: boolean) => {
  const kind = kinds?.[0];
  return kind ? <span className={typeSuffixStyle}>{kindLabel(kind, array)}</span> : undefined;
};

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
  const [search, setSearch] = useState("");
  const text = search.trim().toLowerCase();
  const order = flattenSteps(document.steps);
  const from = order.findIndex(({ step }) => step.stepId === stepId);
  const match = sameOutput(stepId, outputName);
  const items: TiledItem[] = order
    .slice(from + 1)
    .flatMap(({ step }) => inputsTaking(document, step.stepId, match))
    .filter(
      ({ step, input }) =>
        !text ||
        input.label.toLowerCase().includes(text) ||
        stepLabel(step).toLowerCase().includes(text),
    )
    .map(({ step, entry, input, source, filled }) => ({
      id: `${step.stepId}.${input.name}`,
      text: input.label,
      // Playground `ctxOf`: the innermost loop the step sits in, then the step.
      description: [...loopsOf(document, step.stepId).slice(-1), stepLabel(step)].join(" › "),
      icon: entry.icon as IconName,
      tint: kTile(document, step.stepId),
      selected: filled,
      selectedStyle: "tick" as const,
      suffix: <span className={typeSuffixStyle}>{typeWords(input)}</span>,
      onClick: () => {
        setDocument((current) => connect(current, step.stepId, input.name, source));
        onClose();
      },
    }));
  return (
    <OpenMenu
      anchor={anchor}
      position="bottom-start"
      onClose={onClose}
      label="Use in a step"
      className={`${menuWidthStyle} ${tiledRowsStyle} ${laterMenuStyle}`}
      header={
        <SearchHeader value={search} onChange={setSearch} placeholder="Search inputs" focusOnOpen />
      }
      items={tileMenu([
        {
          id: "later",
          label: "Later steps",
          items:
            items.length > 0
              ? items
              : [
                  {
                    id: "none",
                    text: text ? `No input matches “${search}”` : "No later step takes it",
                    disabled: true,
                  },
                ],
        },
      ])}
    />
  );
};

const UseMenu = ({
  anchor,
  userId,
  match,
  onOpenStep,
  onClose,
}: {
  anchor: React.RefObject<Element | null>;
  userId: string;
  match: (source: StepInputSource | undefined) => boolean;
  onOpenStep: () => void;
  onClose: () => void;
}) => {
  const { document, setDocument } = useEditor();
  const step = findStep(document, userId)?.step;
  const inputs: MenuItem[] = inputsTaking(document, userId, match).map(
    ({ input, source, filled }) => ({
      id: input.name,
      text: input.label,
      selected: filled,
      selectedStyle: "tick" as const,
      suffix: typeSuffix(input.kinds, input.array),
      onClick: () => {
        if (!filled) {
          setDocument((current) =>
            connect(disconnect(current, userId, match), userId, input.name, source),
          );
        }
        onClose();
      },
    }),
  );
  return (
    <OpenMenu
      anchor={anchor}
      position="bottom-end"
      onClose={onClose}
      label={step ? stepLabel(step) : userId}
      className={menuWidthStyle}
      items={[
        ...(inputs.length > 0
          ? [{ id: "inputs", label: step ? stepLabel(step) : userId, items: inputs }]
          : []),
        {
          id: "open",
          label: "",
          items: [
            {
              id: "open-step",
              text: "Open step",
              onClick: () => {
                onOpenStep();
                onClose();
              },
            },
          ],
        },
      ]}
    />
  );
};

/** The row's × and ⋮: 24 px ghost squares at the row's top right, over a fade, shown on hover (playground ctls). */
const controlsStyle = css({
  position: "absolute",
  top: "[8px]",
  right: "[4px]",
  display: "none",
  gap: "[2px]",
  paddingLeft: "3",
  borderRadius: "md",
  "[data-use]:hover &, [data-use]:focus-within &, &[data-open]": { display: "flex" },
  // The fade only over the hovered row's fill, so a row left with its menu open stays white.
  "[data-use]:hover &": {
    background:
      "[linear-gradient(to right, transparent, var(--colors-neutral-bg-surface-hover) 12px)]",
  },
});

const controlStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[24px]",
  height: "[24px]",
  padding: "[0]",
  border: "none",
  borderRadius: "md",
  background: "[transparent]",
  cursor: "pointer",
  color: "neutral.fg.subtle",
  _hover: { color: "neutral.fg.heading", backgroundColor: "neutral.a10" },
  "&[data-open]": { color: "neutral.fg.heading", backgroundColor: "neutral.a10" },
  "& > svg": { width: "[14px !important]", height: "[14px !important]" },
});

const UseControls = ({
  userId,
  name,
  match,
  onOpenStep,
}: {
  userId: string;
  name: string;
  match: (source: StepInputSource | undefined) => boolean;
  onOpenStep: () => void;
}) => {
  const { setDocument } = useEditor();
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <span className={controlsStyle} data-open={open || undefined}>
      <button
        ref={anchor}
        type="button"
        className={controlStyle}
        data-open={open || undefined}
        aria-label={`Input for ${name}`}
        onClick={() => setOpen((current) => !current)}
      >
        <Icon name="ellipsisVertical" size="sm" />
      </button>
      <button
        type="button"
        className={controlStyle}
        aria-label={`Stop using in ${name}`}
        onClick={() => setDocument((current) => disconnect(current, userId, match))}
      >
        <Icon name="close" size="sm" />
      </button>
      {open ? (
        <UseMenu
          anchor={anchor}
          userId={userId}
          match={match}
          onOpenStep={onOpenStep}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </span>
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
        {kind ? <span className={typeChipStyle}>{kind}</span> : null}
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
                    <span className={stepTileStyle} style={kTile(document, use.stepId)}>
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
                {readOnly ? null : (
                  <UseControls
                    userId={use.stepId}
                    name={step ? stepLabel(step) : use.stepId}
                    match={sameOutput(stepId, outputName)}
                    onOpenStep={() => select(use.stepId)}
                  />
                )}
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
