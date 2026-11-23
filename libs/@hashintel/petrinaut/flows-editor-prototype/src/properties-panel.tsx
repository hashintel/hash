import { useRef, useState } from "react";
import { Box, ListChecks } from "lucide-react";

import { kindIcon } from "./kind-icon";

import {
  Button,
  Icon,
  NumberInput,
  SegmentedControl,
  TextInput,
} from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { Tile as StepsListTile } from "./left-panel";
import { OverlayScrollArea } from "../../src/ui/components/overlay-scroll-area";
import { Select } from "./fill-select";
import { BranchRows, DecisionRow, PathsSection } from "./branches";
import { pathsGroups } from "./paths-flags";
import { namedPorts, pathRenamable, switchTake } from "./switch-flags";
import {
  AnswerPathGroups,
  IfPathGroups,
  SwitchPathGroups,
  SwitchSections,
} from "./switch-panel";
import {
  type CatalogEntry,
  forEachEntry,
  getCatalogEntry,
  inputLabels,
  stepOutputs,
  type InputView,
} from "./catalog";
import {
  START_ID,
  type DraftActionStep,
  type DraftForEachStep,
  type EditorDocument,
  entityTypeOf,
  findStep,
  itemName,
  stepLabel,
  findTrigger,
  removeTrigger,
  updateStep,
  updateTrigger,
  usersOf,
} from "./document";
import { FLOW_OUTPUTS_ID, FlowOutputsPanel } from "./flow-outputs";
import {
  inScreenState,
  showDebug,
  showFull,
  useEditor,
} from "./editor-context";
import {
  allPayloadKinds,
  type PayloadKind,
  type StepInputSource,
} from "./engine";
import {
  isFreeText,
  inputHover,
  ListField,
  ListSourceField,
  listModeOf,
  MentionField,
  PatchField,
  PropertyField,
  QueryField,
  ValueField,
} from "./fields";
import { ghostKindOf, TriggersPanel } from "./flow-triggers";
import { isMockPayloadKind } from "./mock-action-definitions";
import { findEntityType, mockEntities, mockEntityTypes } from "./mock-graph";
import {
  describeCron,
  fromCron,
  type Repeat,
  toCron,
  type InputMapping as InputMappingValue,
  type TriggerKind,
  type TriggerNode,
  triggerDefinitions,
  isEntityTrigger,
  weekdays,
} from "./mock-triggers";
import { OutputRows } from "./outputs";
import { ToggleableTextInput } from "./ds-parts/toggleable-text-input";
import { lastRunCount, ListSourceBlock } from "./list-source";
import { RefPath, refLook } from "./ref-path";

import { RunPanel } from "./run-view";
import { UsedInList, usesMatching } from "./used-in";
import {
  acceptedKinds,
  describeSource,
  getItemShape,
  getSourceShape,
} from "./shapes";
import { SourceMenu } from "./source-menu";
import { RowTile, selectedLabel } from "./menu-rows";
import { statusColor, tileColor } from "./status-colors";
import { firstAndMore, TimeField, TypedValue } from "./typed-value";
import {
  descriptionInputStyle,
  HueHeader,
  kindGroupOf,
  kindLabel,
  mutedTextStyle,
  OriginMark,
  panelHeaderStyle,
  panelKindTake,
  PropertyRow,
  Section,
  SourceChip,
  titleFieldStyle,
  type Tone,
} from "./ui";

import type { IconName } from "@hashintel/ds-components";

/** Docked on the right, full height, as on ↳ Current: 420 wide, a hairline on its left, 16 px in, 20 px between blocks. */
const panelStyle = css({
  position: "relative",
  flexShrink: 0,
  width: "[384px]",
  height: "[100%]",
  display: "flex",
  flexDirection: "column",
  backgroundColor: "neutral.bgSolid.min",
  borderLeftWidth: "thin",
  borderLeftStyle: "solid",
  borderLeftColor: "neutral.bd.solid",
  zIndex: "[5]",
});

const compactPanelStyle = css({
  "&[class]": {
    "--u-ix": "8px",
    "--u-nx": "34px",
    "--u-dx": "34px",
    "--u-r": "8px",
    "--u-nc": "4px",
    "--u-rh": "32px",
    "--u-px": "36px",
    "--u-tx": "66px",
    "--u-lx": "34px",
    "--u-lt": "66px",
  },
  "&[class] section > div[class*='grid-tc_']": {
    gridTemplateColumns: "minmax(0, 1fr)",
  },
  "&[class] [data-row].d_contents > span[data-scope=tooltip]:first-child, &[class] [data-row].d_contents > [data-property-name], &[class] [data-joiner='where']": {
    position: "relative",
    display: "flex",
    alignItems: "center",
    alignSelf: "stretch",
    width: "[auto]",
    height: "[var(--u-rh)]",
    paddingLeft: "[var(--u-nx)]",
    boxSizing: "border-box",
  },
  "&[class] [data-property-name] > span:not([data-input-icon]), &[class] [data-field-label]": {
    textStyle: "sm",
    lineHeight: "[20px]",
    color: "neutral.fg.heading",
  },
  "&[class] [data-input-icon]": {
    position: "absolute",
    left: "[var(--u-ix)]",
    top: "[calc((var(--u-rh) - 14px) / 2)]",
    width: "[14px]",
    height: "[14px]",
    display: "flex",
    color: "neutral.fg.heading",
  },
  "&[class] [data-row].d_contents > span[data-scope=tooltip]:first-child + div, &[class] [data-row].d_contents > [data-property-name] + div": {
    marginLeft: "[var(--u-dx)]",
    marginRight: "[var(--u-r)]",
    marginTop: "[calc(var(--u-nc) - 12px)]",
  },
  "&[class] [data-condition-row]": {
    marginLeft: "[var(--u-dx)]",
    marginRight: "[var(--u-r)]",
    marginTop: "[calc(var(--u-nc) - 8px)]",
    width: "[auto]",
    alignSelf: "stretch",
  },
  "&[class] [data-condition-builder] > div:last-child": { marginTop: "[-12px]" },
  "&[class] [data-condition-builder] > div:last-child > button": {
    border: "none",
    background: "[transparent]",
    boxShadow: "[none]",
    height: "[32px]",
    padding: "[0 0 0 var(--u-px)]",
    color: "neutral.fg.muted",
    opacity: "1",
    fontWeight: "normal",
    textStyle: "sm",
  },
  "&[class] [data-condition-builder] > div:last-child > button > span": {
    marginLeft: "[calc(var(--u-tx) - var(--u-px) - 16px)]",
  },
  "&[class] [data-output-use]": {
    color: "neutral.fg.muted",
    opacity: "1",
    marginLeft: "[calc(var(--u-px) - 34px)]",
    gap: "[calc(var(--u-tx) - var(--u-px) - 16px)]",
  },
  "&[class] [data-used-names]": { paddingLeft: "[calc(var(--u-lx) + 4px)]" },
  "&[class] [data-used-names] > button": { gap: "[calc(var(--u-lt) - var(--u-lx) - 20px)]" },
  "&[class] [data-output] [data-row]": { minHeight: "[var(--u-rh)]" },
  "&[class] [data-output] [data-row] > span.ml_auto": { display: "contents" },
  "&[class] [data-output] [data-row] span:has(> [data-output-flag])": { marginLeft: "[-9px]" },
  "&[class] [data-output] [data-row] span:has(> button[aria-label^='Used in'])": { marginLeft: "auto" },
  "&[class] [data-output] [data-row] button[aria-label^='Used in']": {
    position: "relative",
    top: "[1px]",
  },
  "&[class] [data-output] [data-row] button[aria-label^='Used in'] [data-stack-tile]": {
    position: "relative",
    top: "[-1px]",
  },
  "&[class] [data-output] [data-row] > span[class*='h_[16px]']": {
    height: "[18px]",
    paddingTop: "[2px]",
    boxSizing: "border-box",
  },
  "&[class] [data-input-icon] svg, &[class] [data-output] [data-row] > [data-type-icon] svg": {
    "--icon-size": "14px",
    width: "[14px]",
    height: "[14px]",
    minWidth: "[14px]",
    overflow: "visible",
  },
  "&[class] [data-output] [data-row] [data-output-flag] svg": {
    "--icon-size": "14px",
    width: "[14px]",
    height: "[14px]",
  },
  "&[class] [data-input-icon] svg > *, &[class] [data-output] [data-row] > [data-type-icon] svg > *, &[class] [data-output] [data-row] [data-output-flag] svg > *": {
    vectorEffect: "non-scaling-stroke",
  },
  "&[class] [data-output] div:has(> [data-output-use])": { visibility: "visible" },
});

/** Match all14's drawing-bound centring on the name's cap height, without changing the row's layout. */
const alignPanelRowIcons = (panel: HTMLElement) => {
  const align = () => {
    if (!panel.isConnected) return;
    const canvas = globalThis.document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return;
    for (const row of panel.querySelectorAll(
      "[data-property-name], [data-joiner], [data-output] [data-row]",
    )) {
      const output = row.matches("[data-row]");
      const name = row.querySelector<HTMLElement>(
        output
          ? ":scope > span:nth-child(2) > span"
          : ":scope > input, :scope > span:last-child",
      );
      const icon = row.querySelector<SVGSVGElement>(
        output
          ? ":scope > [data-type-icon] svg"
          : ":scope > [data-input-icon] svg",
      );
      if (!name || !icon || !icon.getBoundingClientRect().width) continue;
      const font = getComputedStyle(name);
      const sample = globalThis.document.createElement("span");
      sample.style.cssText =
        "position:absolute;left:-9999px;top:0;white-space:nowrap;display:block";
      for (const property of [
        "font-family",
        "font-size",
        "font-weight",
        "font-style",
        "line-height",
        "letter-spacing",
      ]) {
        sample.style.setProperty(property, font.getPropertyValue(property));
      }
      sample.append("H");
      const marker = globalThis.document.createElement("i");
      marker.style.cssText =
        "display:inline-block;width:0;height:0;padding:0;margin:0;vertical-align:baseline";
      sample.append(marker);
      globalThis.document.body.append(sample);
      const contentTop =
        name instanceof HTMLInputElement
          ? parseFloat(font.borderTopWidth) + parseFloat(font.paddingTop)
          : 0;
      const baseline =
        name.getBoundingClientRect().top +
        contentTop +
        marker.getBoundingClientRect().top -
        sample.getBoundingClientRect().top;
      sample.remove();
      context.font = `${font.fontStyle} ${font.fontWeight} ${font.fontSize} ${font.fontFamily}`;
      const capHeight = context.measureText("H").actualBoundingBoxAscent;
      icon.style.transform = "none";
      const bounds = icon.getBBox();
      const matrix = icon.getScreenCTM();
      if (!matrix) continue;
      const center = (bounds.y + bounds.height / 2) * matrix.d + matrix.f;
      icon.style.transform = `translateY(${baseline - capHeight / 2 - center}px)`;
    }
  };
  align();
  void globalThis.document.fonts.ready.then(align);
  const mutations = new MutationObserver(align);
  mutations.observe(panel, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  const resize = new ResizeObserver(align);
  resize.observe(panel);
  return () => {
    mutations.disconnect();
    resize.disconnect();
  };
};

const inputIcon = (input: InputView, kinds: readonly string[]) => {
  if (kinds.includes("VersionedUrl")) {
    return <Box size={16} strokeWidth={1.25} />;
  }
  if (input.options || (kinds.length === 1 && kinds.includes("Boolean"))) {
    return <ListChecks size={16} strokeWidth={1.25} />;
  }
  const kind = kinds.length === 1 ? kinds.at(0) : undefined;
  return kind ? <Icon name={kindIcon(kindLabel(kind, input.array))} size="sm" /> : undefined;
};

/**
 * DS size takes (inbox `value-field-size`, `panel-label-size`), off by default:
 * - `?fieldsize=28`: value fields at DS sm 28, the size Figma and code share, as the panel's buttons and Add filter are.
 * - `?labelsize=12|14`: field labels on the DS xs or sm type step instead of 13 px; `13` keeps 13 px and brings the
 *   filter builder's "Where" (14 px today) down to match.
 * The sizes live in `ui.tsx` and `fields.tsx`; the takes override them from the panel root so those files stay as they are.
 */
const sizeQuery = new URLSearchParams(globalThis.location.search);
const fieldSizeTake = sizeQuery.get("fieldsize") === "28" ? "28" : undefined;
// 14 is the default (inbox panel-label-size, decided 9 Nov); `?labelsize=old` is the 13 px labels from before.
const labelSizeTake = ((value) =>
  value === "old"
    ? undefined
    : value === "12" || value === "13"
      ? value
      : "14")(sizeQuery.get("labelsize"));

const sizeTakeStyle = css({
  // Hand-built triggers (`selectTriggerStyle`) and list fields (`listFieldStyle`) at 32 px; the DS Select, lifted to 32
  // by a padding override, goes back to its own sm padding.
  "&[data-fieldsize='28'] button.h_\\[32px\\]": { height: "[28px]" },
  "&[data-fieldsize='28'] .min-h_\\[32px\\]": { minHeight: "[28px]" },
  "&[data-fieldsize='28'] [class~='--form-padding-y_spacing.0.5']": {
    "--form-padding-y": "spacing.0.5",
  },
  "&[data-labelsize='12'] .fs_\\[13px\\]": { fontSize: "xs" },
  "&[data-labelsize='14'] .fs_\\[13px\\]": { fontSize: "sm" },
  // Labels that draw their own size (the filter builder's "Where", 14 px today) follow every take; 13 shows today's
  // labels with Where brought down to match them.
  "&[data-labelsize='12'] [data-field-label]": { fontSize: "xs" },
  "&[data-labelsize='13'] [data-field-label]": { fontSize: "[13px]" },
  "&[data-labelsize='14'] [data-field-label]": { fontSize: "sm" },
});

/**
 * Inputs and Settings of an action step, label left and control right on one line (Dei, 18 Nov; Paper board L1T-TIGHT):
 * the label column is the panel's longest label plus 12 px (`--label-col`, measured by `fitLabelColumn`), no icon sits
 * before a label, controls end on the panel's right padding edge, and a multi-line field keeps its label above.
 * `?layout=stack` brings back the stacked rows from before. Outputs and the Used in list are left as they were.
 */
const stackLayout = sizeQuery.get("layout") === "stack";
const sideRows = "&[class][class] section:not(:has([data-output]))";
const labelCol = "[var(--label-col, 104px)]";
const sideLayoutStyle = css({
  [`${sideRows} > div[class*='grid-tc_']`]: {
    gridTemplateColumns: "[var(--label-col, 104px) minmax(0, 1fr)]",
    columnGap: "0",
    alignItems: "start",
  },
  [`${sideRows} [data-row].d_contents > span[data-scope=tooltip]:first-child, ${sideRows} [data-row].d_contents > [data-property-name], ${sideRows} [data-row].d_contents > span[data-scope=tooltip] > [data-property-name]`]:
    { paddingLeft: "0" },
  [`${sideRows} [data-row].d_contents > span[data-scope=tooltip]:first-child + div, ${sideRows} [data-row].d_contents > [data-property-name] + div`]:
    { marginLeft: "0", marginRight: "0", marginTop: "0" },
  [`${sideRows} [data-property-name] > [data-input-icon]`]: { display: "none" },
  "&[class][class] [data-condition-builder] [data-joiner] > [data-input-icon]": { display: "none" },
  [`${sideRows} [data-row].d_contents > span[data-scope=tooltip]:has(+ div > [data-multiline]), ${sideRows} [data-row].d_contents > [data-property-name]:has(+ div > [data-multiline])`]:
    { gridColumn: "1 / -1" },
  [`${sideRows} [data-row].d_contents > div:has(> [data-multiline])`]: {
    gridColumn: "1 / -1",
    marginTop: "[-8px]",
  },
  "&[class][class] [data-condition-builder]": { "--flows-label-column": labelCol },
  "&[class][class] [data-condition-builder] div:has(> [data-joiner])": {
    flexDirection: "row",
    alignItems: "center",
    gap: "0",
  },
  "&[class][class] [data-condition-builder] [data-joiner]": {
    width: labelCol,
    flexShrink: 0,
    paddingLeft: "0",
  },
  "&[class][class] [data-condition-builder] [data-condition-row]": {
    marginLeft: "0",
    marginRight: "0",
    marginTop: "0",
    alignSelf: "auto",
    flex: "1",
    minWidth: "[0]",
  },
  "&[class][class] [data-condition-builder] > div:last-child > button": {
    paddingLeft: "[calc(var(--label-col, 104px) + 2px)]",
  },
});

/** Sets `--label-col` on the panel: its widest label (a name and its marks, or "Where") plus 12 px. */
const fitLabelColumn = (panel: HTMLElement) => {
  const fit = () => {
    if (!panel.isConnected) return;
    let widest = 0;
    for (const label of panel.querySelectorAll(
      "[data-property-name], [data-joiner='where'] [data-field-label]",
    )) {
      const range = globalThis.document.createRange();
      range.selectNodeContents(label);
      widest = Math.max(widest, range.getBoundingClientRect().width);
    }
    if (widest > 0) {
      panel.style.setProperty("--label-col", `${Math.ceil(widest) + 12}px`);
    }
  };
  fit();
  void globalThis.document.fonts.ready.then(fit);
  const mutations = new MutationObserver(fit);
  mutations.observe(panel, { childList: true, subtree: true, characterData: true });
  return () => mutations.disconnect();
};

const panelRef = (panel: HTMLElement | null) => {
  if (!panel) return;
  const stopAlign = alignPanelRowIcons(panel);
  const stopFit = stackLayout ? undefined : fitLabelColumn(panel);
  return () => {
    stopAlign();
    stopFit?.();
  };
};

/** The panel's content, inside Petrinaut's thin overlay scrollbar (no native scrollbars). */
const panelBodyStyle = css({
  display: "flex",
  flexDirection: "column",
  // Picked panel 748:30752 and the step outputs playground: 32 px between the header and each section.
  gap: "8",
  padding: "4",
});

/** The icon and tile colour a node shows on the canvas, for the chips that point at it. */
const nodeLook = (
  document: EditorDocument,
  id: string,
): { icon: IconName; tone: Tone } => {
  if (id === START_ID) {
    return { icon: "play", tone: "neutral" };
  }
  const trigger = findTrigger(document, id);
  if (trigger) {
    return { icon: triggerDefinitions[trigger.kind].icon, tone: "blue" };
  }
  const step = findStep(document, id)?.step;
  if (step?.kind === "for-each") {
    return { icon: "rotate", tone: "green" };
  }
  const entry = step ? getCatalogEntry(step.actionDefinitionId) : undefined;
  return { icon: entry?.icon ?? "cube", tone: entry?.tone ?? "green" };
};

/** An empty value ("Ends here", "Not used yet"): the value's size, in the subtle colour of an empty state. */
const emptyValueStyle = css({ textStyle: "sm", color: "neutral.fg.muted" });

/** "Used in N": which steps read a value, opening their `Step › Input` rows (11 Nov convergence A1; was "Used by" chips). */
const UsedBy = ({
  match,
  quiet = false,
}: {
  match: (source: StepInputSource) => boolean;
  /** Show nothing, rather than "Not used yet", when no step reads the value. */
  quiet?: boolean;
}) => {
  const { document } = useEditor();
  const uses = usesMatching(
    document,
    (source) => source !== undefined && match(source),
  );
  if (uses.length === 0) {
    return quiet ? null : <span className={emptyValueStyle}>Not used yet</span>;
  }
  return (
    <UsedInList uses={uses} iconOf={(id) => nodeLook(document, id).icon} />
  );
};

/**
 * MOCK: every step panel has a Settings section (ledger, 23 Oct: one layout for all actions).
 * The engine has no on-failure or deadline setting yet; the values are fixed.
 */
const StepSettings = ({
  actionDefinitionId,
}: {
  actionDefinitionId: string;
}) => (
  <Section title="Settings">
    {actionDefinitionId === "requestReview" ? (
      <PropertyRow
        label="Deadline"
        icon={<ListChecks size={16} strokeWidth={1.25} />}
        hover="With no deadline the request waits until someone answers (ledger, 13 Oct)"
      >
        <Select
          size="sm"
          items={[{ value: "none", text: "No deadline" }]}
          value="none"
          onChange={() => {}}
        />
      </PropertyRow>
    ) : null}
    <PropertyRow
      label="On failure"
      icon={<ListChecks size={16} strokeWidth={1.25} />}
      hover="A step that errors stops the run by default (ledger, 13 Oct)"
    >
      <Select
        size="sm"
        items={[{ value: "stop", text: "Stop the run" }]}
        renderItem={() => selectedLabel("Stop the run", true)}
        // The chosen value reads like the neighbouring selects': plain, not the menu row's selected label.
        renderSelectedItem={() => "Stop the run"}
        value="stop"
        onChange={() => {}}
      />
    </PropertyRow>
  </Section>
);

/** Short notes that get the expand control (textarea-placement 7). */
const expandableInputs = new Set(["instructions"]);

const expandWrapStyle = css({
  position: "relative",
  // A 28 px right column keeps text out from under the control.
  "& [role=textbox]": { paddingRight: "[28px]" },
  "& [data-expand]": {
    display: "flex",
    position: "absolute",
    top: "[6px]",
    right: "[5px]",
    opacity: "0",
    transition: "[opacity 0.1s ease]",
  },
  "&:hover [data-expand], &:focus-within [data-expand]": { opacity: "1" },
});

/** Expanded: at least 8 lines, like Body's room. */
const expandedBoxStyle = css({ "& [role=textbox]": { minHeight: "[190px]" } });

/**
 * A short text area with an expand control at its top-right on hover or focus.
 */
const ExpandableTextRow = ({
  label,
  hover,
  required,
  invalid,
  icon,
  children,
}: {
  label: string;
  hover: string;
  required?: boolean;
  invalid?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) => {
  const [expanded, setExpanded] = useState(false);
  const control = (
    <span data-expand>
      <Button
        size="xxs"
        variant="ghost"
        iconName={expanded ? "collapse" : "expand"}
        aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
        tooltip={expanded ? "Collapse" : "Expand"}
        onClick={() => setExpanded((current) => !current)}
      />
    </span>
  );
  return (
    <PropertyRow label={label} icon={icon} hover={hover} required={required} invalid={invalid}>
      <div className={cx(expandWrapStyle, expanded && expandedBoxStyle)} data-multiline={expanded || undefined}>
        {children}
        {control}
      </div>
    </PropertyRow>
  );
};

/** Fields and sections the Figma panels leave out; `?full` brings them back. */
const trimmedInputs: Record<string, string[]> = {
  sendEmail: ["cc", "senderAddress", "attachments"],
  getFileFromUrl: ["description", "displayName"],
};


const Checks = ({ stepId }: { stepId: string }) => {
  const { validation } = useEditor();
  if (!showDebug) {
    return null;
  }
  const problems = validation.byStep.get(stepId) ?? [];
  if (problems.length === 0) {
    return null;
  }
  return (
    <Section title="Engine checks">
      {problems.map((problem, index) => (
        <div
          // eslint-disable-next-line react/no-array-index-key -- messages can repeat
          key={index}
          className={css({
            textStyle: "xs",
            color:
              problem.severity === "error"
                ? "[var(--flows-failed-text)]"
                : "neutral.fg.muted",
          })}
        >
          {problem.message}
        </div>
      ))}
    </Section>
  );
};

const DescriptionInput = ({
  value,
  label,
  onChange,
  className,
  placeholder = "Add a description…",
}: {
  value: string;
  label: string;
  onChange: (next: string) => void;
  className?: string;
  placeholder?: string;
}) => (
  <input
    className={cx(descriptionInputStyle, className)}
    value={value}
    placeholder={placeholder}
    aria-label={label}
    onChange={(event) => onChange(event.target.value)}
  />
);

/** A derived default reads as the value, not as a hint. */
const derivedPlaceholderStyle = css({
  "&::placeholder": { color: "neutral.fg.muted.hover" },
});

/** Delete sits top right and shows on hover or focus, so the header reads as in Figma at rest. */
const headerActionStyle = css({
  position: "absolute",
  top: "[-6px]",
  right: "[-4px]",
  transition: "[opacity 0.15s ease]",
});

/** The field after a kind word: the same 3 px inset and −3 px margin as k1's "Action · ", so the gap matches. */
const afterPrefixStyle = css({
  flex: "1",
  minWidth: "0",
  display: "grid",
  "& input": {
    marginLeft: "[-3px]",
    paddingLeft: "[2px]",
    width: "[calc(100% + 10px)]",
  },
});

const kindWordStyle = css({
  flexShrink: 0,
  whiteSpace: "pre",
  textStyle: "sm",
  color: "neutral.fg.heading",
});

/**
 * `?panelkind=k2..k4` (inbox panel-header-kind). With no description: k2 shows the type and "Add a description…";
 * k3 "Documents · Add a description…"; k4 the type as the title (the field's placeholder, as the Steps tree names an
 * undescribed step) with the group word under it.
 */
const KindTakeHeader = ({
  icon,
  kind,
  group,
  origin,
  field,
}: {
  icon: IconName;
  kind: string;
  group?: string;
  origin?: React.ReactNode;
  field: {
    label: string;
    value: string;
    placeholder?: string;
    onChange: (next: string) => void;
  } | null;
}) => {
  const described = !!field?.value.trim();
  if (panelKindTake === "k4") {
    return (
      <HueHeader
        icon={icon}
        title={
          <>
            {field ? (
              // A div, not a span: the title line clips a leading span for its ellipsis, which would cut the
              // field's fill and ring.
              <div
                className={css({ flex: "1", minWidth: "0", display: "grid" })}
              >
                <DescriptionInput
                  {...field}
                  className={titleFieldStyle}
                  placeholder={kind}
                />
              </div>
            ) : (
              <span>{kind}</span>
            )}
            {origin}
          </>
        }
      >
        {described || group ? (
          <span className={kindWordStyle}>{described ? kind : group}</span>
        ) : null}
      </HueHeader>
    );
  }
  const input = field ? (
    <DescriptionInput
      {...field}
      placeholder={field.placeholder ?? "Add a description…"}
      className={field.placeholder ? derivedPlaceholderStyle : undefined}
    />
  ) : null;
  return (
    <HueHeader
      icon={icon}
      title={
        <>
          <span>{kind}</span>
          {origin}
        </>
      }
    >
      {panelKindTake === "k3" && group ? (
        <span className={css({ display: "flex", alignItems: "baseline" })}>
          <span className={kindWordStyle}>{`${group} · `}</span>
          {input ? <span className={afterPrefixStyle}>{input}</span> : null}
        </span>
      ) : (
        input
      )}
    </HueHeader>
  );
};

const PanelHeader = ({
  icon,
  type,
  origin,
  stepId,
  description,
  trigger,
  subtitle,
  kind,
  group,
  defaultDescription,
}: {
  icon: IconName;
  type: string;
  origin?: React.ReactNode;
  stepId?: string;
  description?: string;
  /** A trigger node: its description and delete act on the trigger. */
  trigger?: TriggerNode;
  /** Static text under the title, in place of the description field. */
  subtitle?: string;
  /** `?panelkind=k2..k4`: the step's type when `type` is its description (For each, triggers). */
  kind?: string;
  /** `?panelkind=k3`: the kind word, when the icon's P-a group isn't it (triggers). */
  group?: string;
  /** Shown in the description's place, in the same ink, while the description is empty. */
  defaultDescription?: string;
}) => {
  const { setDocument, setUi, deleteSteps } = useEditor();
  const onDelete = trigger
    ? trigger.id === START_ID
      ? null
      : () => {
          setDocument((document) => removeTrigger(document, trigger.id));
          setUi((ui) => ({ ...ui, selectedId: START_ID, triggerId: null }));
        }
    : stepId
      ? () => deleteSteps([stepId])
      : null;
  const what = trigger ? "trigger" : "step";
  const second = subtitle ? (
    <span
      className={cx(
        descriptionInputStyle,
        // Read-only: the same place as the editable line, without its hover.
        css({
          display: "block",
          cursor: "default",
          "&:hover:not(:focus)": { backgroundColor: "[transparent]" },
        }),
      )}
    >
      {subtitle}
    </span>
  ) : trigger ? (
    <DescriptionInput
      label="Trigger description"
      value={trigger.description}
      onChange={(next) =>
        setDocument((document) =>
          updateTrigger(document, trigger.id, (current) => ({
            ...current,
            description: next,
          })),
        )
      }
    />
  ) : stepId && description !== undefined ? (
    // "Action · description", as in V3 P1 (Figma 118:1748); with no description yet, "Add a description…" alone (J2.1).
    <span className={css({ display: "flex", alignItems: "baseline" })}>
      {description.trim() ? (
        <span
          className={css({
            flexShrink: 0,
            whiteSpace: "pre",
            textStyle: "sm",
            color: "neutral.fg.heading",
          })}
        >
          {"Action · "}
        </span>
      ) : null}
      <span
        className={css({
          flex: "1",
          minWidth: "0",
          display: "grid",
          // After "Action · " the text sits one space past the dot, as in the run view. The field's inset shrinks to
          // 3 px (2 padding + 1 border) with a matching −3 px margin, so its hover fill stays inside the space and
          // never touches the dot.
          "&[data-after-prefix] input": {
            marginLeft: "[-3px]",
            paddingLeft: "[2px]",
            width: "[calc(100% + 10px)]",
          },
        })}
        data-after-prefix={description.trim() ? true : undefined}
      >
        <DescriptionInput
          label="Step description"
          value={description}
          onChange={(next) =>
            setDocument((document) =>
              updateStep(document, stepId, (step) => ({
                ...step,
                description: next,
              })),
            )
          }
        />
      </span>
    </span>
  ) : null;
  return (
    <div className={panelHeaderStyle}>
      {panelKindTake !== "k1" ? (
        <KindTakeHeader
          icon={icon}
          kind={kind ?? type}
          group={group ?? kindGroupOf(icon)}
          origin={origin}
          field={
            trigger
              ? {
                  label: "Trigger description",
                  value: trigger.description,
                  onChange: (next) =>
                    setDocument((document) =>
                      updateTrigger(document, trigger.id, (current) => ({
                        ...current,
                        description: next,
                      })),
                    ),
                }
              : stepId && description !== undefined
                ? {
                    label: "Step description",
                    value: description,
                    placeholder: defaultDescription,
                    onChange: (next) =>
                      setDocument((document) =>
                        updateStep(document, stepId, (step) => ({
                          ...step,
                          description: next,
                        })),
                      ),
                  }
                : null
          }
        />
      ) : (
        <HueHeader
          icon={icon}
          title={
            <>
              <span>{type}</span>
              {origin}
            </>
          }
        >
          {second}
        </HueHeader>
      )}
      {onDelete ? (
        <span className={headerActionStyle} data-header-action>
          <Button
            size="xs"
            variant="ghost"
            iconName="trash"
            aria-label={`Delete ${what}`}
            tooltip={`Delete ${what}`}
            onClick={onDelete}
          />
        </span>
      ) : null}
    </div>
  );
};

const fieldFor = (
  document: EditorDocument,
  step: DraftActionStep,
  input: InputView,
) => {
  const entry = getCatalogEntry(step.actionDefinitionId)!;
  const kinds = input.kinds ?? [];
  const props = { step, input, entry };
  if (kinds.includes("EntityQuery")) {
    return <QueryField {...props} mode="query" />;
  }
  if (kinds.includes("FilterCondition")) {
    const subjectInput = step.inputs.items ?? step.inputs.value;
    const typeHint = entityTypeOf(document, subjectInput, step.stepId);
    return <QueryField {...props} mode="condition" typeHint={typeHint} />;
  }
  if (kinds.includes("EntityProperty")) {
    return <PropertyField {...props} />;
  }
  if (
    kinds.includes("PropertyPatch") ||
    kinds.includes("PropertyObjectWithMetadata")
  ) {
    return <PatchField {...props} />;
  }
  if (input.array) {
    return listModeOf(input) === "reference" ? (
      <ListSourceField {...props} />
    ) : (
      <ListField {...props} />
    );
  }
  if (isFreeText(input)) {
    return <MentionField {...props} />;
  }
  return <ValueField {...props} />;
};

const ActionSections = ({
  step,
  entry,
  visibleInputs,
}: {
  step: DraftActionStep;
  entry: CatalogEntry;
  visibleInputs: InputView[];
}) => {
  const { document, validation } = useEditor();
  const iconOf = (id: string) => nodeLook(document, id).icon;
  const renderInput = (input: InputView) => {
    const kinds = acceptedKinds(document, step.stepId, input, entry);
    // Query builders stack: key above, builder below (Journey 3).
    if (kinds.includes("EntityQuery") || kinds.includes("FilterCondition")) {
      return (
        // Its rows join the section grid; the builder itself spans both columns.
        <div key={input.name} className={css({ display: "contents" })} data-row>
          {fieldFor(document, step, input)}
        </div>
      );
    }
    const label =
      inputLabels[`${step.actionDefinitionId}.${input.name}`] ?? input.label;
    if (
      isFreeText(input) &&
      expandableInputs.has(input.name)
    ) {
      return (
        <ExpandableTextRow
          key={input.name}
          label={label}
          icon={inputIcon(input, kinds)}
          hover={inputHover(input, kinds)}
          required={input.required && !input.hasDefault}
          invalid={validation.mockFields.has(`${step.stepId}.${input.name}`)}
        >
          {fieldFor(document, step, input)}
        </ExpandableTextRow>
      );
    }
    return (
      <PropertyRow
        key={input.name}
        label={label}
        icon={inputIcon(input, kinds)}
        hover={inputHover(input, kinds)}
        required={
          input.required &&
          !input.hasDefault &&
          !input.rule?.startsWith("At least")
        }
        invalid={validation.mockFields.has(`${step.stepId}.${input.name}`)}
      >
        {input.name === "body" ? (
          <div className={css({ display: "contents" })} data-multiline>
            {fieldFor(document, step, input)}
          </div>
        ) : (
          fieldFor(document, step, input)
        )}
      </PropertyRow>
    );
  };
  // A branching step's port values are not data: they show as its paths.
  const dataOutputs = stepOutputs(step).filter(
    (output) => !entry.ports?.some((port) => port.outputName === output.name),
  );
  const kindOf = (outputName: string) => {
    const shape = getSourceShape(
      document,
      { kind: "step-output", stepId: step.stepId, outputName },
      step.stepId,
    );
    if (!shape) {
      return null;
    }
    // A list of entities names its type, as the source menu does: "List of Suppliers".
    const entityType = shape.array
      ? findEntityType(
          entityTypeOf(
            document,
            { kind: "step-output", stepId: step.stepId, outputName },
            step.stepId,
          ) ?? "",
        )
      : undefined;
    return entityType
      ? `List of ${entityType.pluralTitle}`
      : kindLabel(shape.payloadKind, shape.array);
  };

  // Paths as groups (inbox `paths-no-rail`, B, 12 Nov): Settings, then Paths, each path its condition rows and "Goes
  // to". If's Yes is built as a Switch case. `?paths=rail` keeps the look from before.
  if (
    pathsGroups &&
    entry.ports &&
    (step.actionDefinitionId === "if" || step.actionDefinitionId === "switch")
  ) {
    const ports = namedPorts(step, entry.ports);
    const yes = ports.find((port) => port.outputName === "true");
    const no = ports.find((port) => port.outputName === "false");
    return (
      <>
        <StepSettings actionDefinitionId={step.actionDefinitionId} />
        {step.actionDefinitionId === "if" && yes && no ? (
          <IfPathGroups
            stepId={step.stepId}
            yes={yes}
            no={no}
            iconOf={iconOf}
            renamable={(port) => pathRenamable(port.outputName)}
          />
        ) : (
          <SwitchPathGroups step={step} ports={entry.ports} iconOf={iconOf} />
        )}
        {dataOutputs.length > 0 ? (
          <Section title="Outputs">
            <OutputRows
              stepId={step.stepId}
              outputs={dataOutputs}
              kindOf={kindOf}
              iconOf={iconOf}
            />
          </Section>
        ) : null}
        <Checks stepId={step.stepId} />
      </>
    );
  }

  const answersAsPaths = step.actionDefinitionId === "requestReview";
  return (
    <>
      {visibleInputs.length > 0 ? (
        <Section title="Inputs">
          {visibleInputs.map(renderInput)}
        </Section>
      ) : null}
      <StepSettings actionDefinitionId={step.actionDefinitionId} />
      <Section title="Outputs">
        {/* Kind badge under each name, users as a short list under it (26 Oct sync; `outputs.tsx`). */}
        <OutputRows
          stepId={step.stepId}
          // A branching step's port values are not data: they show as its paths, under the output they come from.
          outputs={stepOutputs(step).filter(
            (output) =>
              !entry.ports?.some((port) => port.outputName === output.name),
          )}
          kindOf={(outputName) => {
            const shape = getSourceShape(
              document,
              { kind: "step-output", stepId: step.stepId, outputName },
              step.stepId,
            );
            if (!shape) {
              return null;
            }
            // A list of entities names its type, as the source menu does: "List of Suppliers".
            const entityType = shape.array
              ? findEntityType(
                  entityTypeOf(
                    document,
                    { kind: "step-output", stepId: step.stepId, outputName },
                    step.stepId,
                  ) ?? "",
                )
              : undefined;
            return entityType
              ? `List of ${entityType.pluralTitle}`
              : kindLabel(shape.payloadKind, shape.array);
          }}
          iconOf={(id) => nodeLook(document, id).icon}
        />
        {/* Outputs are data (Ciarán, 16 Oct). Only a branching step lists its paths; a straight step's next step is the wire. */}
        {entry.ports && answersAsPaths ? (
          <DecisionRow
            hideValues
            stepId={step.stepId}
            actionDefinitionId={step.actionDefinitionId}
            ports={namedPorts(step, entry.ports)}
            iconOf={(id) => nodeLook(document, id).icon}
          />
        ) : entry.ports ? (
          <BranchRows
            stepId={step.stepId}
            actionDefinitionId={step.actionDefinitionId}
            ports={namedPorts(step, entry.ports)}
            iconOf={(id) => nodeLook(document, id).icon}
          />
        ) : null}
      </Section>
      {entry.ports && answersAsPaths ? (
        <AnswerPathGroups
          step={step}
          ports={entry.ports}
          iconOf={(id) => nodeLook(document, id).icon}
        />
      ) : entry.ports ? (
        <PathsSection
          stepId={step.stepId}
          actionDefinitionId={step.actionDefinitionId}
          ports={entry.ports}
          iconOf={(id) => nodeLook(document, id).icon}
        />
      ) : null}
      <Checks stepId={step.stepId} />
    </>
  );
};

const ActionPanel = ({ step }: { step: DraftActionStep }) => {
  const { document } = useEditor();
  const entry = getCatalogEntry(step.actionDefinitionId);
  if (!entry) {
    return null;
  }
  const origin = !showDebug ? null : entry.origin.kind === "open-pr" ? (
    <OriginMark
      label={`#${entry.origin.pr}`}
      hover={`Defined in open PR #${entry.origin.pr}, not on main yet`}
    />
  ) : entry.origin.kind === "mock" ? (
    <OriginMark label="mock" hover={entry.origin.why} />
  ) : null;

  const hidden = showFull ? [] : (trimmedInputs[step.actionDefinitionId] ?? []);
  // A trimmed input shows once it holds a value (one wired from an output's "Use in a step").
  const visibleInputs = entry.inputs.filter(
    (input) => !hidden.includes(input.name) || !!step.inputs[input.name],
  );

  return (
    <>
      <PanelHeader
        icon={entry.icon}
        type={entry.title}
        origin={origin}
        stepId={step.stepId}
        description={step.description}
      />
      {/* `?switch=`: the demo Switch's panel per take (`switch-panel.tsx`). */}
      {switchTake && step.actionDefinitionId === "switch" && entry.ports ? (
        <>
          <SwitchSections
            step={step}
            ports={entry.ports}
            iconOf={(id) => nodeLook(document, id).icon}
          />
          <Checks stepId={step.stepId} />
        </>
      ) : (
        <ActionSections
          step={step}
          entry={entry}
          visibleInputs={visibleInputs}
        />
      )}
    </>
  );
};

const overInput: InputView = {
  name: "over",
  label: "List",
  array: true,
  required: true,
  hasDefault: false,
  kinds: null,
};

/** The item's name renamed in place sits where plain text would: the field's 8 px inset is pulled back out. */
const itemRenameStyle = css({
  "&[class]": {
    marginLeft: "[-8px]",
    marginRight: "[-8px]",
    fontWeight: "normal",
    color: "neutral.fg.heading",
  },
  "&[data-rename-input]": { minWidth: "[96px]" },
});

const ForEachPanel = ({ step }: { step: DraftForEachStep }) => {
  const { document, setDocument, ui, setUi } = useEditor();
  const anchorRef = useRef<HTMLDivElement>(null);
  const open =
    ui.openField?.stepId === step.stepId && ui.openField.inputName === "over";
  const itemShape = getItemShape(document, step.stepId);
  const over = step.over
    ? describeSource(document, step.over, step.stepId)
    : null;

  const openList = () =>
    setUi((current) => ({
      ...current,
      openField: { stepId: step.stepId, inputName: "over", mode: "menu" },
    }));

  // Any list fits: For each takes an array of any kind.
  const anyListInput: InputView = { ...overInput, kinds: allPayloadKinds };

  // Grouped by step, so each option is just the output's name and nothing gets cut off.
  const collectOptions = step.steps.flatMap((child) =>
    child.kind === "action"
      ? [
          {
            id: child.stepId,
            label: stepLabel(child),
            items: stepOutputs(child).map((output) => ({
              value: `${child.stepId}.${output.name}`,
              text: output.label,
            })),
          },
        ].filter((group) => group.items.length > 0)
      : [],
  );

  return (
    <>
      <PanelHeader
        icon="rotate"
        type={step.description || "For each"}
        kind="For each"
        description={step.description}
        defaultDescription={
          // With no description, the derived item name reads in its place: "For each supplier".
          step.over
            ? `For each ${itemName(document, step.stepId)}`
            : undefined
        }
        subtitle={
          step.description.startsWith("For each ")
            ? `Runs its steps once per ${step.description.slice("For each ".length)}`
            : "Runs its steps once per item of a list"
        }
        stepId={step.stepId}
      />
      <Section title="Inputs">
        <PropertyRow label="List" icon={<Icon name="list" size="sm" />} hover="List of any kind · required" required>
          <div
            ref={anchorRef}
            className={css({
              display: "flex",
              flexDirection: "column",
              alignItems: "stretch",
              gap: "1.5",
            })}
          >
            <ListSourceBlock
              look={step.over && over ? refLook(document, step.over, step.stepId) : null}
              count={lastRunCount(step.over)}
              onClick={openList}
            />
          </div>
          {open ? (
            <SourceMenu
              anchor={anchorRef}
              stepId={step.stepId}
              input={anyListInput}
              entry={forEachEntry}
              listsOnly
              position="bottom-start"
              onClose={() =>
                setUi((current) => ({ ...current, openField: null }))
              }
              onPick={(source) => {
                setDocument((current) =>
                  updateStep(current, step.stepId, (candidate) => ({
                    ...candidate,
                    over: source,
                  })),
                );
                setUi((current) => ({ ...current, openField: null }));
              }}
            />
          ) : null}
        </PropertyRow>
        {showFull ? (
          <PropertyRow
            label="Item"
            hover={
              itemShape
                ? kindLabel(itemShape.payloadKind)
                : "Set the list first"
            }
          >
            {step.over && over ? (
              <ToggleableTextInput
                value={itemName(document, step.stepId)}
                label="Item name"
                className={itemRenameStyle}
                onSave={(next) =>
                  setDocument((current) =>
                    updateStep(current, step.stepId, (candidate) =>
                      candidate.kind === "for-each"
                        ? { ...candidate, itemLabel: next }
                        : candidate,
                    ),
                  )
                }
              />
            ) : (
              <span className={emptyValueStyle}>Set the list first</span>
            )}
          </PropertyRow>
        ) : null}
      </Section>
      <Section title="Settings">
        <span className={emptyValueStyle}>None</span>
      </Section>
      <Section title="Outputs">
        <PropertyRow
          label="Collect"
          icon={<ListChecks size={16} strokeWidth={1.25} />}
          hover="The engine collects one output from every item into a list"
          required
        >
          <Select
            size="sm"
            items={collectOptions}
            value={
              step.collect
                ? `${step.collect.stepId}.${step.collect.outputName}`
                : null
            }
            placeholder={
              collectOptions.length === 0
                ? "Add a step inside first"
                : "Choose an output"
            }
            renderSelectedItem={(value) => {
              const [childId = "", outputName = ""] = value.split(".");
              const look = refLook(
                document,
                { kind: "step-output", stepId: childId, outputName },
                step.stepId,
              );
              return look ? <RefPath look={look} /> : value;
            }}
            onChange={(value) => {
              const [childId, outputName] = (value ?? "").split(".");
              setDocument((current) =>
                updateStep(current, step.stepId, (candidate) => ({
                  ...candidate,
                  collect:
                    childId && outputName
                      ? {
                          stepId: childId,
                          outputName,
                          as: `collected${outputName.charAt(0).toUpperCase()}${outputName.slice(1)}`,
                        }
                      : undefined,
                })),
              );
            }}
          />
          {step.collect ? (
            <UsedBy
              quiet
              match={(source) =>
                source.kind === "step-output" &&
                source.stepId === step.stepId &&
                source.outputName === step.collect?.as
              }
            />
          ) : null}
        </PropertyRow>
      </Section>
      <Checks stepId={step.stepId} />
    </>
  );
};

const inputKindChoices = [
  { value: "Text", text: "Text" },
  { value: "Number", text: "Number" },
  { value: "Date", text: "Date" },
  { value: "DateTime", text: kindLabel("DateTime") },
  { value: "Duration", text: "Duration" },
  { value: "Boolean", text: "Yes or no" },
  { value: "EntityId", text: "Entity" },
  { value: "VersionedUrl", text: "Entity type" },
  { value: "EntityId[]", text: kindLabel("EntityId", true) },
  { value: "Text[]", text: "List of text" },
];

const nextInputNumber = (document: EditorDocument) => {
  let index = document.inputs.length + 1;
  while (document.inputs.some((input) => input.name === `input${index}`)) {
    index += 1;
  }
  return index;
};

/** One flow input: its fields stacked, Remove top right on hover. */
const inputBlockStyle = css({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  "&:not(:hover):not(:focus-within) [data-row-action]": { opacity: "[0]" },
});

const rowActionStyle = css({
  position: "absolute",
  right: "[var(--u-r)]",
  top: "[4px]",
  zIndex: "[1]",
  transition: "[opacity 0.15s ease]",
});

const inputFieldStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  marginTop: "3",
  marginLeft: "[var(--u-dx)]",
  marginRight: "[var(--u-r)]",
});

const inputLabelStyle = css({
  textStyle: "sm",
  lineHeight: "[20px]",
  color: "neutral.fg.muted",
});

const tableHeadStyle = css({ textStyle: "xs", color: "neutral.fg.muted" });

const RunFormFields = () => {
  const { document, setDocument } = useEditor();

  const updateInput = (
    name: string,
    change: Partial<EditorDocument["inputs"][number]>,
  ) =>
    setDocument((current) => ({
      ...current,
      inputs: current.inputs.map((input) =>
        input.name === name ? { ...input, ...change } : input,
      ),
    }));

  const setDefault = (name: string, value: unknown) =>
    setDocument((current) => {
      const inputDefaults = { ...current.inputDefaults };
      if (value === null || value === undefined) {
        delete inputDefaults[name];
      } else {
        inputDefaults[name] = value;
      }
      return { ...current, inputDefaults };
    });

  const addInput = () =>
    setDocument((current) => {
      const index = nextInputNumber(current);
      return {
        ...current,
        inputs: [
          ...current.inputs,
          {
            name: `input${index}`,
            label: `Input ${index}`,
            payloadKind: "Text",
            array: false,
            required: true,
          },
        ],
      };
    });

  // Figma J4: Start lists its inputs as a Name | Type table; the per-input editor (Default value, Add input) is `?full`.
  if (inScreenState && !showFull) {
    const typeChoices = (input: EditorDocument["inputs"][number]) => {
      const entityType = findEntityType(
        document.inputEntityTypes[input.name] ?? "",
      );
      return inputKindChoices.map((choice) =>
        choice.value === (input.array ? "EntityId[]" : "EntityId") && entityType
          ? {
              ...choice,
              text: input.array
                ? `List of ${entityType.pluralTitle}`
                : entityType.title,
            }
          : choice,
      );
    };
    return (
      <Section title="Inputs">
        <div className={css({ display: "contents" })} data-row>
          <span className={tableHeadStyle}>Name</span>
          <span className={tableHeadStyle}>Type</span>
        </div>
        {document.inputs.map((input) => (
          <PropertyRow key={input.name} label={input.label ?? input.name}>
            <Select
              size="sm"
              aria-label={`${input.label ?? input.name} type`}
              items={typeChoices(input)}
              value={`${input.payloadKind}${input.array ? "[]" : ""}`}
              onChange={(value) => {
                if (!value) {
                  return;
                }
                updateInput(input.name, {
                  payloadKind: value.replace("[]", "") as PayloadKind,
                  array: value.endsWith("[]"),
                });
                setDefault(input.name, null);
              }}
            />
          </PropertyRow>
        ))}
      </Section>
    );
  }

  return (
    <Section title="Inputs" gridClassName={css({ rowGap: "[0]" })}>
      {document.inputs.length === 0 ? (
        <span className={mutedTextStyle}>
          No inputs. Add one when a step needs a value nothing earlier gives.
        </span>
      ) : null}
      {document.inputs.map((input, index) => (
        <div
          key={input.name}
          className={cx(
            inputBlockStyle,
            index > 0
              ? css({
                  marginTop: "3",
                  paddingTop: "3",
                  borderTopWidth: "thin",
                  borderTopStyle: "solid",
                  borderTopColor: "neutral.bd.subtle",
                })
              : undefined,
          )}
        >
          <div className={css({ display: "contents" })} data-row>
            <div data-property-name className={css({ paddingRight: "[36px]" })}>
              <span data-input-icon>
                <Icon
                  name={kindIcon(kindLabel(input.payloadKind, input.array))}
                  size="sm"
                />
              </span>
              <DescriptionInput
                value={input.label ?? input.name}
                label="Input name"
                className={css({
                  "&[class]": {
                    color: "neutral.fg.heading",
                    lineHeight: "[20px]",
                  },
                  minWidth: "[0]",
                })}
                onChange={(label) => updateInput(input.name, { label })}
              />
              <span className={rowActionStyle} data-row-action>
                <Button
                  size="xs"
                  variant="ghost"
                  iconName="trash"
                  aria-label={`Remove ${input.label ?? input.name}`}
                  tooltip="Remove"
                  onClick={() =>
                    setDocument((current) => ({
                      ...current,
                      inputs: current.inputs.filter(
                        (other) => other.name !== input.name,
                      ),
                    }))
                  }
                />
              </span>
            </div>
          </div>
          <div className={inputFieldStyle}>
            <span className={inputLabelStyle}>Type</span>
            <Select
              size="sm"
              aria-label="Input type"
              items={inputKindChoices}
              value={`${input.payloadKind}${input.array ? "[]" : ""}`}
              onChange={(value) => {
                if (!value) {
                  return;
                }
                const array = value.endsWith("[]");
                updateInput(input.name, {
                  payloadKind: value.replace("[]", "") as PayloadKind,
                  array,
                });
                // A default of the old type would not fit the new one.
                setDefault(input.name, null);
              }}
            />
          </div>
          {input.payloadKind === "EntityId" ? (
            <div className={inputFieldStyle}>
              <span className={inputLabelStyle}>Entity type</span>
              <Select<string>
                size="sm"
                items={mockEntityTypes.map((type) => ({
                  value: type.baseUrl,
                  text: type.title,
                }))}
                value={document.inputEntityTypes[input.name] ?? null}
                placeholder="Any entity type"
                onChange={(value) =>
                  setDocument((current) => ({
                    ...current,
                    inputEntityTypes: value
                      ? { ...current.inputEntityTypes, [input.name]: value }
                      : Object.fromEntries(
                          Object.entries(current.inputEntityTypes).filter(
                            ([name]) => name !== input.name,
                          ),
                        ),
                  }))
                }
              />
            </div>
          ) : null}
          {input.array && input.payloadKind !== "EntityId" ? null : (
            <div className={inputFieldStyle}>
              <span className={inputLabelStyle}>Default value</span>
              {input.array ? (
                <Select
                  size="sm"
                  multiple
                  searchable
                  renderSelectedAll={firstAndMore(
                    (value) =>
                      mockEntities.find((entity) => entity.entityId === value)
                        ?.label ?? value,
                  )}
                  aria-label={`${input.label ?? input.name} default value`}
                  items={mockEntities
                    .filter(
                      (entity) =>
                        !document.inputEntityTypes[input.name] ||
                        entity.entityTypeBaseUrl ===
                          document.inputEntityTypes[input.name],
                    )
                    .map((entity) => ({
                      value: entity.entityId as string,
                      text: entity.label,
                    }))}
                  value={
                    Array.isArray(document.inputDefaults?.[input.name])
                      ? (document.inputDefaults[input.name] as string[])
                      : []
                  }
                  placeholder="No default"
                  onChange={(value) => setDefault(input.name, value)}
                />
              ) : (
                <TypedValue
                  kind={input.payloadKind}
                  label={`${input.label ?? input.name} default value`}
                  allowRelative
                  entityTypeBaseUrl={document.inputEntityTypes[input.name]}
                  value={document.inputDefaults?.[input.name]}
                  placeholder={
                    input.payloadKind === "Text" ? "No default" : undefined
                  }
                  onChange={(value) => setDefault(input.name, value)}
                />
              )}
            </div>
          )}
          {usersOf(
            document,
            (source) =>
              source.kind === "flow-input" && source.inputName === input.name,
          ).length > 0 ? (
            <div
              className={css({
                marginTop: "2",
                marginLeft: "[var(--u-dx)]",
                marginRight: "[var(--u-r)]",
              })}
            >
              <UsedBy
                quiet
                match={(source) =>
                  source.kind === "flow-input" &&
                  source.inputName === input.name
                }
              />
            </div>
          ) : null}
        </div>
      ))}
      <button
        type="button"
        className={css({
          position: "relative",
          display: "flex",
          alignItems: "center",
          height: "[var(--u-rh)]",
          marginTop: "1",
          paddingLeft: "[var(--u-tx)]",
          textStyle: "sm",
          color: "neutral.fg.muted",
          cursor: "pointer",
        })}
        onClick={addInput}
      >
        <span
          className={css({
            position: "absolute",
            left: "[38px]",
            display: "flex",
          })}
        >
          <Icon name="plus" size="xs" />
        </span>
        Add input
      </button>
    </Section>
  );
};

const timezones = ["Europe/London", "America/New_York", "UTC"];

/** Recurring schedule's settings, backed by the engine's real `CronScheduleSpec`. */
const ScheduleSettings = ({ trigger }: { trigger: TriggerNode }) => {
  const { setDocument } = useEditor();
  const spec = trigger.settings.spec ?? {
    type: "cron" as const,
    cronExpression: "0 9 1 * *",
    timezone: "Europe/London",
  };
  const parts = fromCron(spec.cronExpression);
  const setSpec = (next: typeof spec) =>
    setDocument((document) =>
      updateTrigger(document, trigger.id, (current) => ({
        ...current,
        settings: { ...current.settings, spec: next },
      })),
    );
  const setParts = (change: Partial<typeof parts>) =>
    setSpec({ ...spec, cronExpression: toCron({ ...parts, ...change }) });

  return (
    <Section title="Settings">
      <PropertyRow label="Repeat" required>
        <SegmentedControl<Repeat>
          size="sm"
          items={[
            { value: "day", label: "Daily" },
            { value: "week", label: "Weekly" },
            { value: "month", label: "Monthly" },
          ]}
          value={parts.repeat}
          onChange={(repeat) => setParts({ repeat })}
        />
      </PropertyRow>
      {parts.repeat === "month" ? (
        <PropertyRow label="On day">
          <NumberInput
            size="sm"
            value={parts.dayOfMonth}
            onChange={(day) =>
              setParts({ dayOfMonth: Math.min(28, Math.max(1, day ?? 1)) })
            }
            width="fullWidth"
          />
        </PropertyRow>
      ) : null}
      {parts.repeat === "week" ? (
        <PropertyRow label="On">
          <Select
            size="sm"
            items={weekdays.map((day, index) => ({
              value: String(index),
              text: day,
            }))}
            value={String(parts.dayOfWeek)}
            onChange={(day) => setParts({ dayOfWeek: Number(day ?? 1) })}
          />
        </PropertyRow>
      ) : null}
      <PropertyRow label="At" required>
        <TimeField
          label="At"
          value={parts.time}
          onChange={(time) => setParts({ time })}
        />
      </PropertyRow>
      <PropertyRow label="Time zone" required>
        <Select
          size="sm"
          items={timezones.map((zone) => ({ value: zone, text: zone }))}
          value={spec.timezone ?? "UTC"}
          onChange={(timezone) =>
            setSpec({ ...spec, timezone: timezone ?? undefined })
          }
        />
      </PropertyRow>
      <div className={mutedTextStyle}>
        {describeCron(spec)}
        {spec.timezone ? ` (${spec.timezone})` : ""}
      </div>
    </Section>
  );
};

/**
 * A trigger's condition: the condition builder on the watched type's properties (field kinds v2, F10; the draft PRD
 * types it as long text). Nothing runs before a trigger, so its values are typed or picked, never variables.
 */
const TriggerCondition = ({
  trigger,
  entityTypeBaseUrl,
}: {
  trigger: TriggerNode;
  entityTypeBaseUrl: string;
}) => {
  const entry = getCatalogEntry("if")!;
  // The builder edits a step's input; the trigger stands in as a step with no inputs, its draft keyed by its id.
  const step = {
    kind: "action",
    stepId: trigger.id,
    actionDefinitionId: "if",
    inputs: {},
  } as unknown as DraftActionStep;
  const input: InputView = {
    name: "condition",
    label: "Condition",
    array: false,
    required: false,
    hasDefault: false,
    kinds: ["FilterCondition"],
  };
  return (
    <QueryField
      step={step}
      input={input}
      entry={entry}
      mode="condition"
      typeHint={entityTypeBaseUrl}
      allowVariables={false}
    />
  );
};

/** MOCK: Entity created / updated settings, from the draft PRD. */
const whenItems = [
  { value: "entityCreated", text: "Created" },
  { value: "entityUpdated", text: "Updated" },
  { value: "entityChanged", text: "Created or updated" },
];

const EntitySettings = ({ trigger }: { trigger: TriggerNode }) => {
  const { setDocument } = useEditor();
  const set = (change: Partial<TriggerNode["settings"]>) =>
    setDocument((document) =>
      updateTrigger(document, trigger.id, (current) => ({
        ...current,
        settings: { ...current.settings, ...change },
      })),
    );
  const type = findEntityType(trigger.settings.entityTypeBaseUrl);
  return (
    <Section title="Settings">
      <PropertyRow
        label="Entity type"
        required
        hover="The kind of entity to watch"
      >
        <Select<string>
          size="sm"
          prefix={type ? { iconName: "cube" } : undefined}
          items={mockEntityTypes.map((candidate) => ({
            value: candidate.baseUrl,
            text: candidate.title,
          }))}
          value={trigger.settings.entityTypeBaseUrl ?? null}
          placeholder="Choose a type"
          onChange={(value) =>
            set({
              entityTypeBaseUrl: value ?? undefined,
              propertiesToWatch: [],
            })
          }
        />
      </PropertyRow>
      <PropertyRow label="When" hover="Which changes start a run">
        <Select
          size="sm"
          items={whenItems}
          value={trigger.kind}
          onChange={(kind) =>
            kind
              ? setDocument((document) =>
                  updateTrigger(document, trigger.id, (current) => ({
                    ...current,
                    kind: kind as TriggerKind,
                  })),
                )
              : undefined
          }
        />
      </PropertyRow>
      {trigger.kind !== "entityCreated" && !(inScreenState && !showFull) ? (
        <PropertyRow
          label="Properties to watch"
          wrapLabel
          hover="Only start when one of these changes. Empty means any change."
        >
          <Select<string>
            size="sm"
            multiple
            items={(type?.properties ?? []).map((property) => ({
              value: property.baseUrl,
              text: property.title,
            }))}
            value={trigger.settings.propertiesToWatch ?? []}
            placeholder="Any property"
            onChange={(propertiesToWatch) => set({ propertiesToWatch })}
          />
        </PropertyRow>
      ) : null}
      {inScreenState && !showFull ? null : type ? (
        <TriggerCondition trigger={trigger} entityTypeBaseUrl={type.baseUrl} />
      ) : (
        <PropertyRow
          label="Condition"
          hover="Only start when the entity matches"
        >
          <span className={emptyValueStyle}>Choose an entity type first</span>
        </PropertyRow>
      )}
    </Section>
  );
};

const WebhookSettings = ({ trigger }: { trigger: TriggerNode }) => (
  <Section title="Settings">
    <PropertyRow label="URL" hover="Calls to this address start a run">
      <TextInput
        size="sm"
        value={trigger.settings.webhookUrl ?? ""}
        readonly
        onChange={() => undefined}
      />
    </PropertyRow>
  </Section>
);

/**
 * What a trigger gives each of Start's inputs: one of its fields of the same kind, or a fixed value (editor layer,
 * mocked: the engine has inputs, not triggers).
 */
const InputMapping = ({ trigger }: { trigger: TriggerNode }) => {
  const { document, setDocument } = useEditor();
  const definition = triggerDefinitions[trigger.kind];
  const entityType = findEntityType(trigger.settings.entityTypeBaseUrl);
  const outputLabel = (output: { name: string; label: string }) =>
    output.name === "changedEntities" && entityType
      ? `The ${entityType.title.toLowerCase()} that changed`
      : output.label;
  const setMapping = (
    inputName: string,
    mapping: InputMappingValue | undefined,
  ) =>
    setDocument((current) =>
      updateTrigger(current, trigger.id, (candidate) => {
        const inputMap = { ...candidate.settings.inputMap };
        if (mapping) {
          inputMap[inputName] = mapping;
        } else {
          delete inputMap[inputName];
        }
        return { ...candidate, settings: { ...candidate.settings, inputMap } };
      }),
    );
  return (
    <Section title="Flow inputs">
      {document.inputs.length === 0 ? (
        <span className={mutedTextStyle}>No flow inputs yet.</span>
      ) : null}
      {document.inputs.map((input) => {
        const fields = definition.outputs.filter(
          (output) =>
            output.payloadKind === input.payloadKind &&
            output.array === input.array,
        );
        const mapping = trigger.settings.inputMap?.[input.name];
        const choice =
          mapping?.kind === "field"
            ? `field:${mapping.output}`
            : mapping?.kind === "fixed"
              ? "fixed"
              : null;
        const mapped =
          mapping?.kind === "field"
            ? fields.find((output) => output.name === mapping.output)
            : undefined;
        // With no trigger field to take, the only choice is a value, so show the value field alone (Figma J4 A2).
        const valueOnly = fields.length === 0 && !input.array;
        return (
          <PropertyRow
            key={input.name}
            label={input.label ?? input.name}
            hover={kindLabel(input.payloadKind, input.array)}
            required={input.required}
          >
            {mapped ? (
              <SourceChip
                icon={definition.icon}
                // Figma J4 A2 draws the chip with no ×; clearing it is `?full`.
                onRemove={
                  inScreenState && !showFull
                    ? undefined
                    : () => setMapping(input.name, undefined)
                }
              >
                {outputLabel(mapped)}
              </SourceChip>
            ) : valueOnly ? null : (
              <Select
                size="sm"
                items={[
                  ...fields.map((output) => ({
                    value: `field:${output.name}`,
                    text: outputLabel(output),
                  })),
                  { value: "fixed", text: "Fixed value" },
                ]}
                value={choice}
                placeholder={
                  fields.length === 0 ? "Fixed value" : "Choose a field"
                }
                onChange={(value) =>
                  setMapping(
                    input.name,
                    value === "fixed"
                      ? { kind: "fixed", value: null }
                      : value
                        ? {
                            kind: "field",
                            output: value.slice("field:".length),
                          }
                        : undefined,
                  )
                }
              />
            )}
            {(mapping?.kind === "fixed" || valueOnly) && !input.array ? (
              <TypedValue
                kind={input.payloadKind}
                compact
                label={`${input.label ?? input.name} fixed value`}
                allowRelative
                entityTypeBaseUrl={document.inputEntityTypes[input.name]}
                value={
                  mapping?.kind === "fixed"
                    ? (mapping.value ?? undefined)
                    : undefined
                }
                onChange={(value) =>
                  setMapping(input.name, { kind: "fixed", value })
                }
              />
            ) : null}
          </PropertyRow>
        );
      })}
    </Section>
  );
};

/** Start: the flow's inputs, which the Run button's form and every trigger fill. Nothing about triggers (4 Nov). */
const StartPanel = () => {
  const { document, setDocument } = useEditor();
  const startDescription = (
    <DescriptionInput
      label="Start description"
      value={document.startDescription}
      onChange={(next) =>
        setDocument((current) => ({ ...current, startDescription: next }))
      }
    />
  );
  return (
    <>
      <div className={panelHeaderStyle}>
        <HueHeader icon="play" title={<span>Start</span>}>
          {startDescription}
        </HueHeader>
      </div>
      {/* Triggers are read-only here (4 Nov): they show as ghost nodes left of Start, and open their own panel. */}
      <RunFormFields />
    </>
  );
};

/** A trigger node: what starts the run, its settings, and what it gives Start's inputs. */
const TriggerPanel = ({ trigger }: { trigger: TriggerNode }) => {
  const definition = triggerDefinitions[trigger.kind];
  return (
    <>
      <PanelHeader
        icon={definition.icon}
        type={trigger.description || definition.title}
        subtitle="Trigger"
        trigger={trigger}
        kind={definition.title}
        group="Trigger"
      />
      {trigger.kind === "schedule" ? (
        <ScheduleSettings trigger={trigger} />
      ) : null}
      {isEntityTrigger(trigger.kind) ? (
        <EntitySettings trigger={trigger} />
      ) : null}
      {trigger.kind === "webhook" ? (
        <WebhookSettings trigger={trigger} />
      ) : null}
      <InputMapping trigger={trigger} />
    </>
  );
};

/** A 12 px alert mark. */
export const markStyle = css({
  display: "inline-flex",
  flexShrink: 0,
  "& svg": { width: "[12px]", height: "[12px]", "--icon-size": "12px" },
});

const fixRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "3",
  width: "[100%]",
  paddingX: "2",
  paddingY: "1.5",
  marginX: "[-8px]",
  borderRadius: "md",
  textAlign: "left",
  cursor: "pointer",
  _hover: { backgroundColor: "neutral.bg.surface.hover" },
});

export type FixItem = { stepId: string; title: string; icon: IconName; message: string };

/**
 * Publish on a draft with problems (13 Nov, confirmed 20 Nov): the flow, then "N to fix" with one two-line row per
 * step, its tile, its name, and the reason under it behind a red alert mark. A row selects its step; × closes the panel.
 */
export const FixPanel = ({ items }: { items: FixItem[] }) => {
  const { document, setUi } = useEditor();
  return (
    <aside className={panelStyle} aria-label="To fix">
      <OverlayScrollArea>
        <div className={panelBodyStyle}>
          <div className={css({ display: "flex", flexDirection: "column", gap: "5" })}>
            <div className={css({ display: "flex", alignItems: "flex-start", gap: "3" })}>
              <div className={css({ flex: "1", display: "flex", flexDirection: "column", gap: "1" })}>
                <span className={css({ textStyle: "base", fontWeight: "medium", color: "neutral.fg.heading" })}>
                  {document.name}
                </span>
                <span className={css({ textStyle: "sm", color: "neutral.fg.subtle" })}>Add a description…</span>
              </div>
              <Button
                size="sm"
                variant="subtle"
                tone="neutral"
                iconName="close"
                aria-label="Close"
                onClick={() => setUi((current) => ({ ...current, fixOpen: false }))}
              />
            </div>
            <Section title={`${items.length} to fix`}>
              <div className={css({ display: "flex", flexDirection: "column" })}>
                {items.map((item) => (
                  <button
                    key={`${item.stepId}-${item.message}`}
                    type="button"
                    className={fixRowStyle}
                    data-fix-row
                    onClick={() =>
                      setUi((current) => ({
                        ...current,
                        selectedId: item.stepId,
                        selectedIds: [item.stepId],
                        triggerId: null,
                        fixOpen: false,
                      }))
                    }
                  >
                    <RowTile icon={item.icon} twoLine tint={tileColor(item.icon)} />
                    <span className={css({ display: "flex", flexDirection: "column", minWidth: "[0]" })}>
                      <span className={css({ textStyle: "sm", color: "neutral.fg.heading" })}>{item.title}</span>
                      <span
                        className={css({
                          display: "flex",
                          alignItems: "center",
                          gap: "1.5",
                          textStyle: "xs",
                          color: "neutral.fg.muted",
                        })}
                      >
                        <span
                          className={markStyle}
                          style={{ color: statusColor.failed }}
                        >
                          <Icon name="error" size="xs" />
                        </span>
                        {item.message}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </Section>
          </div>
        </div>
      </OverlayScrollArea>
    </aside>
  );
};

const multiRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  height: "[32px]",
  textStyle: "sm",
  color: "neutral.fg.heading",
  fontWeight: "medium",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});


/**
 * Several steps selected (inbox missing-multiselect, b, 13 Nov): "3 steps selected" over the kind and the loop they
 * sit in, the steps as the Steps list draws them, then Disconnect all and Delete 3 steps.
 */
const MultiSelectPanel = ({ ids }: { ids: string[] }) => {
  const { document, setDocument, deleteSteps } = useEditor();
  const found = ids
    .map((id) => findStep(document, id))
    .filter((entry) => entry !== undefined);
  if (found.length < 2) {
    return null;
  }
  const looks = found.map((entry) => nodeLook(document, entry.step.stepId));
  const groups = new Set(looks.map((look) => kindGroupOf(look.icon)));
  const parents = new Set(found.map((entry) => entry.parentId ?? null));
  const parentId = parents.size === 1 ? [...parents][0] : null;
  const parent = parentId ? findStep(document, parentId)?.step : undefined;
  const subtitle = [
    groups.size === 1 ? [...groups][0] : null,
    parent ? stepLabel(parent) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const selected = new Set(found.map((entry) => entry.step.stepId));
  const count = found.length;
  return (
    <>
      <HueHeader
        icon={groups.size === 1 ? looks[0]!.icon : "cube"}
        title={<span>{`${count} steps selected`}</span>}
      >
        {subtitle ? <span className={kindWordStyle}>{subtitle}</span> : null}
      </HueHeader>
      <Section title="Steps">
        <div className={css({ display: "flex", flexDirection: "column" })}>
        {found.map((entry, index) => (
          <span
            key={entry.step.stepId}
            className={multiRowStyle}
            data-multi-row
          >
            <StepsListTile icon={looks[index]!.icon} tone={looks[index]!.tone} />
            {stepLabel(entry.step)}
          </span>
        ))}
        </div>
      </Section>
      <div className={css({ display: "flex", gap: "2" })}>
        <Button
          size="sm"
          variant="subtle"
          onClick={() =>
            setDocument((current) => ({
              ...current,
              wires: current.wires.filter(
                (wire) =>
                  !selected.has(wire.source) && !selected.has(wire.target),
              ),
            }))
          }
        >
          Disconnect all
        </Button>
        <Button
          size="sm"
          variant="subtle"
          onClick={() => deleteSteps([...selected])}
        >
          {`Delete ${count} steps`}
        </Button>
      </div>
    </>
  );
};

export const PropertiesPanel = () => {
  const { document, ui } = useEditor();
  // A trigger opens from Start's "Started by" list: Start stays selected, the panel shows the trigger (J4 A2).
  const trigger =
    ui.selectedId === START_ID && ui.triggerId
      ? findTrigger(document, ui.triggerId)
      : null;
  const found =
    !ui.selectedId ||
    ui.selectedId === START_ID ||
    ui.selectedId === FLOW_OUTPUTS_ID
      ? null
      : findStep(document, ui.selectedId);
  // With nothing selected there is no panel; Publish on a draft with problems opens `FixPanel` instead.
  if (!ui.selectedId && !ui.run) {
    return null;
  }
  // A ghost trigger node opens the read-only Triggers panel (J4.3).
  const ghost = ghostKindOf(ui.selectedId);
  return (
    <aside
      ref={panelRef}
      className={cx(
        panelStyle,
        sizeTakeStyle,
        compactPanelStyle,
        !stackLayout && found?.step.kind === "action" && !trigger && sideLayoutStyle,
      )}
      data-fieldsize={fieldSizeTake}
      data-labelsize={labelSizeTake}
      aria-label="Properties"
    >
      <OverlayScrollArea>
        <div className={panelBodyStyle}>
          {ui.run ? (
            <RunPanel />
          ) : (ui.selectedIds?.length ?? 0) > 1 ? (
            <MultiSelectPanel ids={ui.selectedIds!} />
          ) : ghost ? (
            <TriggersPanel key={ghost} kind={ghost} />
          ) : trigger ? (
            <TriggerPanel key={trigger.id} trigger={trigger} />
          ) : ui.selectedId === START_ID ? (
            <StartPanel />
          ) : ui.selectedId === FLOW_OUTPUTS_ID ? (
            <FlowOutputsPanel />
          ) : found?.step.kind === "action" ? (
            <ActionPanel key={found.step.stepId} step={found.step} />
          ) : found?.step.kind === "for-each" ? (
            <ForEachPanel key={found.step.stepId} step={found.step} />
          ) : null}
        </div>
      </OverlayScrollArea>
    </aside>
  );
};

export { isMockPayloadKind };
