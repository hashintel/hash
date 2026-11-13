import { useEffect, useRef, useState } from "react";

import { Link, Phone } from "lucide-react";

import {
  Icon,
  type IconName,
  type ItemOrGroup,
  Popover,
  TextInput,
  Tooltip,
} from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { OverlayScrollArea } from "../../src/ui/components/overlay-scroll-area";
import {
  type CatalogEntry,
  getCatalogEntry,
  humanize,
  type InputView,
} from "./catalog";
import {
  START_ID,
  addStep,
  type EditorDocument,
  entityTypeOf,
  findStep,
  itemName,
  itemPropertyOf,
  itemPropertySource,
  setInputSource,
  stepLabel,
} from "./document";
import { useEditor } from "./editor-context";
import { isMockPayloadKind } from "./mock-action-definitions";
import { findEntityType, mockEntities } from "./mock-graph";
import {
  MenuRow,
  srcIconsTake,
  type TiledItem,
  tileMenu,
  tiledRowsStyle,
  valueTiles,
} from "./menu-rows";
import { OpenMenu } from "./open-menu";
import { kindIcon } from "./kind-icon";
import { acceptedKinds, type SourceOption, sourceOptions } from "./shapes";
import { iconStroke } from "./thin-icons";
import { treeTileColor } from "./status-colors";
import { kindLabel } from "./ui";

import type { StepInputSource } from "./engine";
import type { PrdSource } from "./mock-prd-ports";
import { PersonAvatar } from "./person-avatar";

/**
 * Hand-built row for the "@" popover only, with the values the DS Menu item renders at its default size (measured):
 * 8 px in, 3 px above and below, 6 px corners, 6 px gap, 14 px label at 450 weight, `neutral.a35` highlight.
 */
export const menuRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  width: "[100%]",
  paddingX: "2",
  paddingY: "[3px]",
  borderRadius: "md",
  textAlign: "left",
  cursor: "pointer",
  textStyle: "sm",
  fontWeight: "[450]",
  color: "neutral.fg.heading",
  whiteSpace: "nowrap",
  "& > svg": {
    flexShrink: 0,
    width: "[14px]",
    height: "[14px]",
    color: "neutral.fg.muted",
  },
  "& > svg:last-child:not(:first-child)": { width: "[16px]", height: "[16px]" },
  _hover: { backgroundColor: "neutral.bg.subtle.hover" },
  _focusVisible: { backgroundColor: "neutral.bg.subtle.hover", outline: "none" },
  "&[data-active]": { backgroundColor: "neutral.bg.subtle.hover" },
  "&[data-selected]": { backgroundColor: "neutral.a35" },
});

/** An "@" popover row when the menu has two-line rows: the tile layout of `menu-rows.tsx`, 4 px apart. */
const tiledPopoverRowStyle = css({
  display: "flex",
  alignItems: "center",
  width: "[100%]",
  padding: "[6px]",
  borderRadius: "lg",
  textAlign: "left",
  cursor: "pointer",
  fontWeight: "[450]",
  "&:has([data-menu-row=two])": { paddingY: "[8px]" },
  "& + &": { marginTop: "[4px]" },
  _hover: { backgroundColor: "neutral.bg.subtle.hover" },
  _focusVisible: { backgroundColor: "neutral.bg.subtle.hover", outline: "none" },
});

/** A group of rows, 4 px in, with a hairline between groups. */
export const menuGroupStyle = css({
  display: "flex",
  flexDirection: "column",
  padding: "1",
  "& + &": {
    borderTopWidth: "thin",
    borderTopStyle: "solid",
    borderTopColor: "neutral.bd.subtle",
  },
});

/** The DS group title: 12 px medium caps, 8 px in, muted. */
export const menuGroupLabelStyle = css({
  display: "flex",
  alignItems: "center",
  height: "[28px]",
  paddingX: "2",
  textStyle: "xs",
  fontWeight: "medium",
  letterSpacing: "[0.12px]",
  textTransform: "uppercase",
  color: "neutral.fg.subtle",
});

/** A disabled row that says why a group is empty (J3 C2). */
const menuEmptyRowStyle = css({
  display: "flex",
  alignItems: "center",
  paddingX: "2",
  paddingY: "[3px]",
  borderRadius: "md",
  backgroundColor: "neutral.a35",
  textStyle: "sm",
  fontWeight: "[450]",
  color: "neutral.fg.heading",
  opacity: "[0.5]",
  whiteSpace: "nowrap",
});

/** The DS Menu surface: white, the DS subtle hairline, `lg` corners (8 px) and the DS lg shadow. */
export const menuPanelStyle = css({
  display: "flex",
  flexDirection: "column",
  width: "[max-content]",
  minWidth: "[240px]",
  maxWidth: "[380px]",
  maxHeight: "[520px]",
  backgroundColor: "neutral.bgSolid.min",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "lg",
  boxShadow: "lg",
  overflow: "hidden",
});

const rowTextStyle = css({
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

/** "a date", "an entity", "a list of entities": the kind a field takes, for the empty-group rows. */
const kindPhrase = (kinds: readonly string[], array: boolean) => {
  const kind =
    kinds.find((candidate) => !isMockPayloadKind(candidate)) ?? kinds[0];
  if (kind === "VersionedUrl") {
    return "a type";
  }
  const name = kindLabel(kind, false).toLowerCase();
  if (array) {
    return name.endsWith("y") ? `${name.slice(0, -1)}ies` : `${name}s`;
  }
  return /^[aeiou]/.test(name) ? `an ${name}` : `a ${name}`;
};

/** Whether two sources point at the same value, whatever order their keys were written in. */
const sameSource = (left: unknown, right: unknown) => {
  const sorted = (value: unknown): unknown =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value as Record<string, unknown>)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, inner]) => [key, sorted(inner)]),
        )
      : value;
  return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
};

const ownerIcon = (document: EditorDocument, option: SourceOption) => {
  if (option.source.kind === "flow-input") {
    // A flow input lives on Start: Start's outline play icon (J3 · B1).
    return {
      icon: "play" as const,
      tone: "neutral" as const,
    };
  }
  if (option.source.kind === "item") {
    return { icon: "rotate" as const, tone: "green" as const };
  }
  if (option.source.kind === "step-output") {
    const step = findStep(document, option.source.stepId)?.step;
    const entry =
      step?.kind === "action"
        ? getCatalogEntry(step.actionDefinitionId)
        : undefined;
    return {
      icon: entry?.icon ?? ("rotate" as const),
      tone: entry?.tone ?? ("green" as const),
    };
  }
  return { icon: kindIcon("Text"), tone: "neutral" as const };
};

/**
 * Graph lookup as a field source has no engine shape: a lookup is a Find entities step. This places one before the
 * step and connects it when the shapes fit.
 */
export const addLookupStep = (
  document: EditorDocument,
  stepId: string,
  input: InputView,
): { document: EditorDocument; lookupId: string } => {
  const found = findStep(document, stepId);
  const parentId = found?.parentId ?? null;
  const position = document.positions[stepId] ?? { x: 0, y: 0 };
  const incoming = document.wires.find((wire) => wire.target === stepId);
  // Insert, don't stack: the step and everything right of it move one column right, and the lookup takes its place.
  const siblings = new Set(
    (parentId
      ? ((
          findStep(document, parentId)?.step as
            | { steps?: { stepId: string }[] }
            | undefined
        )?.steps ?? [])
      : document.steps
    ).map((step) => step.stepId),
  );
  const shifted = Object.fromEntries(
    Object.entries(document.positions).map(([id, at]) => [
      id,
      siblings.has(id) && at.x >= position.x ? { ...at, x: at.x + 296 } : at,
    ]),
  );
  const { document: withStep, stepId: lookupId } = addStep(
    { ...document, positions: shifted },
    "queryEntities",
    {
      parentId,
      after: incoming
        ? { stepId: incoming.source, port: incoming.sourcePort }
        : undefined,
      position,
    },
  );
  // List the lookup before the step it feeds, so "In this flow" reads in flow order.
  const ordered = withStep.steps.some((step) => step.stepId === stepId)
    ? withStep.steps
        .filter((step) => step.stepId !== lookupId)
        .flatMap((step) =>
          step.stepId === stepId
            ? [withStep.steps.find((other) => other.stepId === lookupId)!, step]
            : [step],
        )
    : withStep.steps;
  const wired: EditorDocument = {
    ...withStep,
    steps: ordered,
    wires: [
      // The old wire into the step now runs through the lookup.
      ...withStep.wires.filter(
        (wire) => wire !== incoming && wire.id !== incoming?.id,
      ),
      {
        id: `${lookupId}:next->${stepId}`,
        source: lookupId,
        sourcePort: "next",
        target: stepId,
      },
    ],
  };
  // Find entities gives a list; only a list input can take it without a For each or Take first.
  const connected =
    input.array && input.kinds?.includes("EntityId")
      ? setInputSource(wired, stepId, input.name, {
          kind: "step-output",
          stepId: lookupId,
          outputName: "entities",
        })
      : wired;
  return { document: connected, lookupId };
};

type SourceGroup = {
  id: string;
  label?: string;
  items: {
    id: string;
    text: React.ReactNode;
    description?: string;
    icon?: IconName;
    /** A type glyph the DS icon set lacks (Link for a URL). */
    glyph?: React.ReactElement;
    /** A step's own hue on its tile (AP G77: step tiles keep their hue). */
    tint?: React.CSSProperties;
    selected?: boolean;
    disabled?: boolean;
    hint?: string;
    suffix?: React.ReactNode;
    /** Picking it changes the menu instead of closing it ("Show more"). */
    keepOpen?: boolean;
    onPick?: () => void;
  }[];
};

const urlFlag = (name: string) =>
  new URLSearchParams(globalThis.location.search).get(name);

/**
 * `?sourcegroups=old`: "This item" and "Flow inputs" as groups of their own, as before X was built in full (ledger
 * 1 Nov, Figma 770:33030). URL only, never remembered.
 */
const oldSourceGroups = urlFlag("sourcegroups") === "old";

/** `?showmore=old`: every row of every group, with no "Show more" (ledger 2 Nov: first 3–4, then Show more). */
const oldShowMore = urlFlag("showmore") === "old";

/** `?lookuphint=old`: the Find entities row's hover text from before the real-names rule ("Adds a Find entities…"). */
const oldLookupHint = urlFlag("lookuphint") === "old";

/** How many rows a group shows before its "Show more" row (ledger 2 Nov call: "first 3–4 + Show more + search"). */
const GROUP_ROWS = 4;

const showMoreTextStyle = css({ color: "neutral.fg.muted" });

/** Every row draws a tile (`?srcicons=a`): rows that had none take a type or kind icon. */
const iconsEverywhere = valueTiles === "all";

/**
 * A property's type as its row's icon (`?srcicons=a`): the output types' icons (`kindIcon`, K3), plus Link for a
 * URL, @ for an email and a phone for a phone number, which the kinds alone don't tell apart.
 */
const typeGlyph = (
  types: readonly string[],
): { icon?: IconName; glyph?: React.ReactElement } => {
  const first = types[0] ?? "";
  if (/url|link/i.test(first)) {
    return { glyph: <Link strokeWidth={iconStroke} /> };
  }
  if (/phone/i.test(first)) {
    return { glyph: <Phone strokeWidth={iconStroke} /> };
  }
  if (/email/i.test(first)) {
    return { icon: "at" };
  }
  return { icon: kindIcon(first) };
};

/** The model as DS Menu groups and items. The fill marks a picked value; a disabled row says why a list is empty. */
const toMenuItems = (groups: SourceGroup[]): Array<ItemOrGroup<TiledItem>> =>
  groups.map((group) => ({
    id: group.id,
    label: group.label ?? "",
    items: group.items.map((item) => ({
      id: item.id,
      text: item.text,
      description: item.description,
      icon: item.icon,
      glyph: item.glyph,
      tint: item.tint,
      selected: item.selected,
      suffix: item.suffix,
      selectedStyle: "highlight" as const,
      disabled: item.disabled,
      keepOpenOnSelect: item.keepOpen,
      onClick: () => item.onPick?.(),
    })),
  }));

/**
 * The DS Menu at its own width: 208 px (DS `_menuContent`), growing with long rows up to 380 px. Was 240 px from our
 * mocks, which left empty space right of the types (Aakarsh, 30 Oct).
 */
const sourceMenuWidthStyle = css({
  "&[class]": { minWidth: "[208px]" },
  maxWidth: "[380px]",
  // DS DIFF: rows end 20 px from the edge, not the DS 12 px, so types and chevrons on the right can breathe
  // (Aakarsh, 30 Oct). Raise at the DS crit before it ships.
  "& [role=menuitem]": { paddingRight: "[16px !important]" },
  // A row with no icon takes no icon slot, so its text lines up with the group title (Figma J3 · C1).
  // ...unless the group has a ticked row: then every row keeps the tick's column, as the DS Menu draws it.
  "& [role=group]:not(:has([data-selected])) [role=menuitem] > span[aria-hidden=true]:empty":
    { display: "none" },
});

/** The For each list menu: 268 px, its right edge on the select's (Figma J1.7, 3 Nov). A long name is clipped. */
const listMenuWidthStyle = css({
  "&[class]": { width: "[268px]", minWidth: "[268px]", maxWidth: "[268px]" },
});

/**
 * The search row as Figma X draws it (770:33030): 32 px, edge to edge, its hairline across the whole menu, the
 * search icon over the rows' tile icons. It cancels the DS Menu's own 4 px and its header's 5 / 8 px insets.
 * `?srcicons=old` keeps the inset 26 px field.
 */
const searchRowStyle = css({
  display: "flex",
  alignItems: "center",
  height: "[32px]",
  marginTop: "[-9px]",
  marginBottom: "[-5px]",
  marginX: "[-12px]",
  paddingX: "[14px]",
});

/** A DS Menu's search: the DS TextInput at sm with a search icon, pinned above the items. */
export const SearchHeader = ({
  value,
  onChange,
  placeholder = "Search",
  focusOnOpen = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Type straight away: focus moves here once the DS Menu has focused itself on open. */
  focusOnOpen?: boolean;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focusOnOpen) {
      return;
    }
    // Two frames: the menu focuses its content in the frame after it opens.
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() =>
        ref.current?.querySelector("input")?.focus(),
      );
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [focusOnOpen]);
  return (
    <div
      ref={ref}
      data-menu-search=""
      className={cx(
        css({
          borderBottomWidth: "thin",
          borderBottomStyle: "solid",
          borderBottomColor: "neutral.bd.subtle",
          // A full-width row, not a boxed input: the focus and hover outline stay off.
          "& *::before": { borderColor: "[transparent !important]" },
        }),
        srcIconsTake !== "old" && searchRowStyle,
      )}
    >
      <TextInput
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        size="sm"
        variant="subtle"
        width="fullWidth"
        prefix={{ iconName: "search", variant: "subtle" }}
      />
    </div>
  );
};

const typeLabelStyle = css({
  flexShrink: 0,
  marginLeft: "auto",
  paddingLeft: "3",
  textStyle: "xs",
  color: "neutral.fg.subtle",
});

/** About how many characters of type names fit right of a property name before the row gets wide. */
const TYPE_LABEL_CHARS = 24;

/**
 * A property's data types on the right of its row (DS menu secondary label). As many types as fit are listed; the
 * rest become "+N", and the hover lists them all (Figma 637:23544 A; Aakarsh, 30 Oct: fit what you can, then +N).
 */
const TypeLabel = ({ types }: { types: string[] }) => {
  let shown = 1;
  while (
    shown < types.length &&
    types.slice(0, shown + 1).join(", ").length +
      (shown + 1 < types.length ? ` +${types.length - shown - 1}`.length : 0) <=
      TYPE_LABEL_CHARS
  ) {
    shown += 1;
  }
  const rest = types.length - shown;
  const label = (
    <span className={typeLabelStyle}>
      {types.slice(0, shown).join(", ")}
      {rest > 0 ? ` +${rest}` : ""}
    </span>
  );
  return rest > 0 ? (
    <Tooltip content={types.join(", ")}>{label}</Tooltip>
  ) : (
    label
  );
};

export type TypedChoice = {
  label: string;
  source: StepInputSource;
  selected?: boolean;
  /** Shown on hover, e.g. what an entity type is. */
  hint?: string;
};

/**
 * The source menu of a field: flow inputs, the current item, earlier steps' outputs, typed choices, and the two ways
 * out when nothing fits. Only compatible values appear.
 */
export const SourceMenu = ({
  anchor,
  stepId,
  input,
  entry,
  onPick,
  onClose,
  query,
  onTypeValue: onTypeValueProp,
  typedChoices: typedChoicesProp = [],
  typedGroupLabel,
  hideSearch = false,
  focusRef,
  searchAlways = false,
  typeValueLabel = "Type a value",
  typeValueIcon = kindIcon("Text"),
  typeValueSource = "Manual input",
  position = "bottom-end",
  alignToPanel = false,
  listsOnly = false,
}: {
  anchor: React.RefObject<Element | null>;
  stepId: string;
  input: InputView;
  entry: CatalogEntry;
  onPick: (source: StepInputSource) => void;
  onClose: () => void;
  /** Set by a free-text field's "@" search. */
  query?: string;
  onTypeValue?: () => void;
  typedChoices?: TypedChoice[];
  /** The heading over the typed choices, e.g. "Entity types". */
  typedGroupLabel?: string;
  hideSearch?: boolean;
  /** Keeps focus here while the menu is open (the field being typed in, for "@" search). */
  focusRef?: React.RefObject<HTMLElement | null>;
  /** Show the search field however short the list is (a list operator's values). */
  searchAlways?: boolean;
  /** The way to enter a value by hand: "Type an address" for emails, "Upload a file" for files. */
  typeValueLabel?: string;
  typeValueIcon?: IconName;
  /** The draft PRD source that allows it: "File upload" for an upload. */
  typeValueSource?: PrdSource;
  /** Where the DS Menu opens against the anchor. */
  position?: "bottom-start" | "bottom-end";
  /** Open under the anchor with the menu's right edge on the properties panel's. */
  alignToPanel?: boolean;
  /** The For each list menu (Figma J2 · C1): a search row, then the earlier steps in flow order, each with its list. */
  listsOnly?: boolean;
}) => {
  const { document, setDocument, setUi } = useEditor();
  const [search, setSearch] = useState("");
  // Groups opened past their first rows with "Show more".
  const [expanded, setExpanded] = useState<string[]>([]);
  const text = (query ?? search).trim().toLowerCase();
  const kinds = acceptedKinds(document, stepId, input, entry);

  // The draft PRD lists which sources each port takes; ports it doesn't list take every source.
  const allows = (source: PrdSource) =>
    !input.sources || input.sources.includes(source);
  const fromSteps = allows("Previous step");
  const lookupAllowed = !listsOnly && allows("HASH graph @lookup");
  const onTypeValue =
    !listsOnly && allows(typeValueSource) ? onTypeValueProp : undefined;
  const typedChoices =
    !listsOnly && (lookupAllowed || allows("Manual input"))
      ? typedChoicesProp
      : [];

  const options = (
    fromSteps ? sourceOptions(document, stepId, input, entry) : []
  )
    .filter((option) => !listsOnly || option.group === "Earlier steps")
    .filter(
      (option) =>
        !text ||
        option.label.toLowerCase().includes(text) ||
        option.ownerLabel.toLowerCase().includes(text),
    );
  const typed = typedChoices.filter(
    (choice) => !text || choice.label.toLowerCase().includes(text),
  );
  // Flow inputs are set on Start: with none that fit, the menu sends the user there (J3 C1, C2).
  const goToStart = () =>
    setUi((ui) => ({
      ...ui,
      selectedId: START_ID,
      triggerId: null,
      openField: null,
    }));

  const lookUp = () => {
    const { document: next, lookupId } = addLookupStep(document, stepId, input);
    setDocument(() => next);
    // The field now reads the new step's entities, shown as its chip; the canvas pans to the step and flashes it.
    onPick({ kind: "step-output", stepId: lookupId, outputName: "entities" });
    setUi((ui) => ({ ...ui, openField: null, flashId: lookupId }));
  };

  const phrase = kindPhrase(kinds, input.array);
  // "Search values" heads every value menu, as in the picked X frame (Figma 770:33030), which shows it over six rows.
  // ?srcsearch=long brings back the old rule: search only on lists longer than eight rows.
  const longList =
    new URLSearchParams(globalThis.location.search).get("srcsearch") !==
      "long" ||
    searchAlways ||
    listsOnly ||
    typedChoicesProp.length + options.length > 8;

  // A list reads "List of Shipments" under its step's name.
  const listName = (option: SourceOption) => {
    const type = findEntityType(
      entityTypeOf(document, option.source, stepId),
    )?.pluralTitle;
    return type ? `List of ${type}` : option.label;
  };
  const optionItems = (group: SourceOption["group"]) =>
    (listsOnly ? options.toReversed() : options)
      .filter((option) => option.group === group)
      .map((option) => ({
        id: JSON.stringify(option.source),
        text: listsOnly ? option.ownerLabel : option.label,
        description: listsOnly ? listName(option) : option.ownerLabel,
        icon: ownerIcon(document, option).icon,
        ...(option.source.kind === "step-output"
          ? { tint: treeTileColor(ownerIcon(document, option).icon) }
          : {}),
        selected: current !== undefined && sameSource(current, option.source),
        hint: `${option.ownerLabel} › ${option.label} · ${kindLabel(option.shape.payloadKind, option.shape.array)}${option.note ? ` · ${option.note}` : ""}`,
        onPick: () => onPick(option.source),
      }));
  // Inside a For each: the item's own properties first, under the loop variable's name (Figma J2 · D2).
  const found = findStep(document, stepId);
  const loopId = found?.parentId ?? null;
  const itemType = loopId
    ? findEntityType(entityTypeOf(document, { kind: "item" }, stepId))
    : undefined;
  const current =
    found?.step.kind === "action" ? found.step.inputs[input.name] : undefined;
  const currentProperty = current ? itemPropertyOf(current) : undefined;
  // MOCK: the engine has no data types yet, so a URL field is known by its label.
  const wantedDataType = input.label === "URL" ? "URL" : undefined;
  const fittingProperties =
    listsOnly || !loopId || !itemType || input.array
      ? []
      : itemType.properties
          .filter((property) => kinds.includes(property.payloadKind))
          // A field that takes one data type lists only properties of that type (Figma 637:23544 C; Dei, 23 Oct).
          .filter(
            (property) =>
              !wantedDataType ||
              (property.dataTypes ?? []).includes(wantedDataType),
          )
          .filter(
            (property) => !text || property.title.toLowerCase().includes(text),
          );
  // Types show only when the rows differ: a field that takes one type lists only that type (Figma 637:23544 C).
  const typesOf = (property: (typeof fittingProperties)[number]) =>
    property.dataTypes ?? [kindLabel(property.payloadKind, false)];
  const showTypes =
    new Set(fittingProperties.map((property) => typesOf(property).join()))
      .size > 1;
  const propertyItems = fittingProperties.map((property) => ({
    id: `item-property:${property.baseUrl}`,
    text: property.title,
    hint: `${itemName(document, loopId!)} › ${property.title} · ${typesOf(property).join(", ")}`,
    suffix: showTypes ? <TypeLabel types={typesOf(property)} /> : undefined,
    ...(iconsEverywhere ? typeGlyph(typesOf(property)) : {}),
    selected: currentProperty?.baseUrl === property.baseUrl,
    onPick: () => onPick(itemPropertySource(property.baseUrl)),
  }));
  const searching = text !== "";
  // X (Figma 770:33030, ledger 2 Nov "Menu rows"): flow inputs are earlier-step rows with "Start · Flow inputs" under
  // them, first, as Start comes first; the current item's rows are one line, in the group named after the item.
  const flowInputs = optionItems("Flow inputs").map((row) =>
    oldSourceGroups ? row : { ...row, description: "Start · Flow inputs" },
  );
  const earlier = oldSourceGroups
    ? optionItems("Earlier steps")
    : [...flowInputs, ...optionItems("Earlier steps")];
  const thisItem = optionItems("This item");
  const itemRows = oldSourceGroups
    ? propertyItems
    : [
        ...thisItem.map((row) => ({
          ...row,
          description: undefined,
          // The item itself is an entity: the entity type's icon, as its outputs show it.
          icon: iconsEverywhere ? ("cube" as const) : undefined,
        })),
        ...propertyItems,
      ];
  const currentItemName = loopId
    ? itemName(document, loopId)
    : options.find((option) => option.group === "This item")?.label;
  const nothingFits =
    options.length === 0 &&
    typed.length === 0 &&
    propertyItems.length === 0 &&
    !lookupAllowed;

  /* One model for both renderings: DS Menu groups and items (icon, description, tick). Headers as the team named
     them (22 Oct): Earlier steps, Flow inputs, Lookup in graph. An empty group says why; Flow inputs then offers
     "Add flow input on Start". */
  const allGroups: SourceGroup[] = [
    ...(itemRows.length > 0 && currentItemName
      ? [
          {
            id: "item-properties",
            label: currentItemName,
            items: itemRows,
          },
        ]
      : []),
    ...(typed.length > 0
      ? [
          {
            id: "typed",
            label:
              typedGroupLabel ??
              (kinds.includes("EntityId") ? "Entities" : "Values"),
            items: typed.map((choice) => ({
              id: `typed:${choice.label}`,
              text: choice.label,
              glyph:
                typedGroupLabel === "People" ? (
                  <PersonAvatar name={choice.label} row />
                ) : undefined,
              avatar: typedGroupLabel === "People",
              icon: iconsEverywhere
                ? typedGroupLabel === "People"
                  ? undefined
                  : kinds.includes("EntityId")
                    ? ("cube" as const)
                    : ("list" as const)
                : undefined,
              selected: choice.selected,
              hint: choice.hint,
              onPick: () => onPick(choice.source),
            })),
          },
        ]
      : []),
    // With nothing earlier that fits, Earlier steps offers only the way to add one on Start, with no line saying
    // why (Figma J2.21, 3 Nov). The For each list has no such action, so it keeps its line.
    ...(fromSteps && earlier.length > 0
      ? [{ id: "Earlier steps", label: "Earlier steps", items: earlier }]
      : fromSteps && !searching && listsOnly
        ? [
            {
              id: "Earlier steps",
              label: "Earlier steps",
              items: [
                {
                  id: "none:earlier",
                  text: `No earlier step gives ${phrase}`,
                  disabled: true,
                },
              ],
            },
          ]
        : fromSteps &&
            !searching &&
            (!oldSourceGroups || flowInputs.length === 0)
          ? [
              {
                id: "Earlier steps",
                label: "Earlier steps",
                items: [
                  {
                    id: "add-flow-input",
                    text: input.array
                      ? "Add a list input on Start"
                      : `Add ${phrase} input on Start`,
                    icon: "plus" as const,
                    onPick: goToStart,
                  },
                ],
              },
            ]
          : []),
    ...(oldSourceGroups && thisItem.length > 0
      ? [{ id: "This item", label: "This item", items: thisItem }]
      : []),
    ...(oldSourceGroups && fromSteps && !listsOnly && flowInputs.length > 0
      ? [{ id: "Flow inputs", label: "Flow inputs", items: flowInputs }]
      : []),
    // A search that finds nothing says so; with no search there is always the Start action above.
    ...(nothingFits && (searching || !fromSteps)
      ? [
          {
            id: "nothing",
            items: [
              {
                id: "nothing",
                text: text
                  ? `Nothing matches “${query ?? search}”`
                  : `Nothing earlier gives ${phrase}`,
                disabled: true,
              },
            ],
          },
        ]
      : []),
    ...(lookupAllowed && (!searching || "find entities".includes(text))
      ? [
          {
            id: "graph",
            label: "Lookup in graph",
            items: [
              {
                id: "lookup",
                text: "Find entities",
                icon: "search" as const,
                suffix: <Icon name="chevronRight" size="xs" />,
                // Real names and › → · only (outputs playground, "Decided"): the new step, then the step it feeds.
                hint:
                  oldLookupHint || !found
                    ? "Adds a Find entities step before this one"
                    : `Find entities → ${stepLabel(found.step)}`,
                onPick: lookUp,
              },
            ],
          },
        ]
      : []),
    // Typing a value by hand, where the port allows it, in the same row grammar.
    ...(onTypeValue
      ? [
          {
            id: "out",
            items: [
              {
                id: "type-value",
                text: typeValueLabel,
                icon: typeValueIcon,
                onPick: onTypeValue,
              },
            ],
          },
        ]
      : []),
  ];
  // Inside a For each with item properties to pick, the "No earlier step gives…" rows would only add noise.
  const fullGroups =
    propertyItems.length > 0
      ? allGroups
          .map((group) => ({
            ...group,
            items: group.items.filter((item) => !item.disabled),
          }))
          .filter((group) => group.items.length > 0)
      : allGroups;
  // The first rows of a long group, then "Show more", which opens the rest in place (ledger 2 Nov call). A search
  // lists every match, and a group whose picked value is further down opens whole.
  const groupsModel = fullGroups.map((group): SourceGroup => {
    const pickedLate = group.items.some(
      (item, index) => item.selected && index >= GROUP_ROWS,
    );
    return oldShowMore ||
      searching ||
      listsOnly ||
      pickedLate ||
      group.items.length <= GROUP_ROWS ||
      expanded.includes(group.id)
      ? group
      : {
          ...group,
          items: [
            ...group.items.slice(0, GROUP_ROWS),
            {
              id: `more:${group.id}`,
              text: <span className={showMoreTextStyle}>Show more</span>,
              icon: iconsEverywhere ? ("ellipsis" as const) : undefined,
              hint: `${group.items.length - GROUP_ROWS} more`,
              keepOpen: true,
              onPick: () => setExpanded((open) => [...open, group.id]),
            },
          ],
        };
  });

  if (query === undefined) {
    // The DS Menu: groups, icons, descriptions and ticks as shipped; the search is its pinned header.
    return (
      <OpenMenu
        anchor={anchor}
        position={position}
        alignToPanel={alignToPanel}
        onClose={onClose}
        label={`Choose ${input.label}`}
        className={cx(
          listsOnly ? listMenuWidthStyle : sourceMenuWidthStyle,
          tiledRowsStyle,
        )}
        header={
          hideSearch || !longList ? undefined : (
            <SearchHeader
              value={search}
              onChange={setSearch}
              placeholder="Search values"
            />
          )
        }
        items={tileMenu(toMenuItems(groupsModel))}
      />
    );
  }

  const tiledPopover =
    valueTiles !== undefined ||
    groupsModel.some((group) => group.items.some((item) => !!item.description));

  // "@" typed in a field: the field keeps focus while the list filters, which the DS Menu cannot do (it takes focus
  // and closes when focus leaves it). DS gap: no mention input (audit section 3 item 6). Same rows, DS Menu look.
  return (
    <Popover
      triggerRef={anchor}
      position="bottom-end"
      gapY={4}
      onClose={onClose}
      initialFocusRef={focusRef}
      returnFocusRef={focusRef}
    >
      <div
        className={menuPanelStyle}
        role="dialog"
        aria-label={`Choose ${input.label}`}
      >
        <OverlayScrollArea className={css({ maxHeight: "[480px]" })}>
          {groupsModel.map((group) => (
            <div key={group.id} className={menuGroupStyle}>
              {group.label ? (
                <div className={menuGroupLabelStyle}>{group.label}</div>
              ) : null}
              {group.items.map((item) =>
                item.disabled ? (
                  <div key={item.id} className={menuEmptyRowStyle}>
                    {valueTiles ? (
                      <MenuRow
                        icon={item.icon ?? "info"}
                        title={item.text}
                        tiles={valueTiles}
                      />
                    ) : (
                      item.text
                    )}
                  </div>
                ) : (
                  <button
                    key={item.id}
                    type="button"
                    className={
                      tiledPopover ? tiledPopoverRowStyle : menuRowStyle
                    }
                    title={item.hint}
                    // "Show more" keeps the caret in the field the "@" was typed in.
                    onMouseDown={
                      item.keepOpen
                        ? (event) => event.preventDefault()
                        : undefined
                    }
                    onClick={item.onPick}
                  >
                    {tiledPopover ? (
                      <MenuRow
                        icon={item.glyph ?? item.icon}
                        title={item.text}
                        description={item.description}
                        tiles={valueTiles}
                      />
                    ) : (
                      <>
                        {item.icon ? <Icon name={item.icon} size="xs" /> : null}
                        <span className={rowTextStyle}>{item.text}</span>
                      </>
                    )}
                    {item.suffix}
                  </button>
                ),
              )}
            </div>
          ))}
        </OverlayScrollArea>
      </div>
    </Popover>
  );
};

/** Typed choices for an entity field: the entities of the mock graph. */
export const entityChoices = (): TypedChoice[] =>
  mockEntities.map((entity) => ({
    label: entity.label,
    source: {
      kind: "constant",
      payload: { kind: "EntityId", value: entity.entityId },
    },
  }));

export { START_ID, humanize };
