import { useEffect, useRef, useState } from "react";

import {
  Icon,
  type IconName,
  type ItemOrGroup,
  type MenuItem,
  Popover,
  TextInput,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

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
  setInputSource,
} from "./document";
import { useEditor } from "./editor-context";
import { isMockPayloadKind } from "./mock-action-definitions";
import { findEntityType, mockEntities } from "./mock-graph";
import { OpenMenu } from "./open-menu";
import { acceptedKinds, type SourceOption, sourceOptions } from "./shapes";
import { kindLabel } from "./ui";

import type { StepInputSource } from "./engine";
import type { PrdSource } from "./mock-prd-ports";

/** A DS Menu item as ↳ Current draws it: 32 px tall, 6 px in, 8 px corners, a bare 14 px icon, 14 px medium label. */
export const menuRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  width: "[100%]",
  minHeight: "[32px]",
  paddingX: "1.5",
  paddingY: "[1px]",
  borderRadius: "lg",
  textAlign: "left",
  cursor: "pointer",
  textStyle: "sm",
  fontWeight: "medium",
  color: "neutral.fg.heading",
  whiteSpace: "nowrap",
  "& > svg": {
    flexShrink: 0,
    width: "[14px]",
    height: "[14px]",
    color: "neutral.fg.muted",
  },
  "& > svg:last-child:not(:first-child)": { width: "[16px]", height: "[16px]" },
  _hover: { backgroundColor: "neutral.bg.surface.active" },
  _focusVisible: {
    backgroundColor: "neutral.bg.surface.active",
    outline: "none",
  },
  "&[data-active], &[data-selected]": {
    backgroundColor: "neutral.bg.surface.active",
  },
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

/** The DS group title: 28 px, 12 px medium caps, muted. */
export const menuGroupLabelStyle = css({
  display: "flex",
  alignItems: "center",
  height: "[28px]",
  paddingX: "1.5",
  textStyle: "xs",
  fontWeight: "medium",
  letterSpacing: "[0.48px]",
  textTransform: "uppercase",
  color: "neutral.fg.subtle",
});

/** A disabled row that says why a group is empty (J3 C2). */
const menuEmptyRowStyle = css({
  display: "flex",
  alignItems: "center",
  minHeight: "[32px]",
  paddingX: "1.5",
  borderRadius: "lg",
  backgroundColor: "neutral.bg.surface.active",
  textStyle: "sm",
  fontWeight: "medium",
  color: "neutral.fg.heading",
  opacity: "[0.5]",
  whiteSpace: "nowrap",
});

/** The DS Menu surface: white, a subtle hairline, 10 px corners and the DS lg shadow. */
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
  borderColor: "neutral.bd.subtle.hover",
  borderRadius: "[10px]",
  boxShadow:
    "[0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)]",
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
  return { icon: "pencil" as const, tone: "neutral" as const };
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
    text: string;
    description?: string;
    icon?: IconName;
    selected?: boolean;
    disabled?: boolean;
    hint?: string;
    suffix?: React.ReactNode;
    onPick?: () => void;
  }[];
};

/** The model as DS Menu groups and items. A tick marks a picked value; a disabled row says why a list is empty. */
const toMenuItems = (groups: SourceGroup[]): Array<ItemOrGroup<MenuItem>> =>
  groups.map((group) => ({
    id: group.id,
    label: group.label ?? "",
    items: group.items.map((item) => ({
      id: item.id,
      text: item.text,
      description: item.description,
      icon: item.icon,
      selected: item.selected,
      suffix: item.suffix,
      selectedStyle: "tick" as const,
      disabled: item.disabled,
      onClick: () => item.onPick?.(),
    })),
  }));

/** The DS Menu at the width the mocks give a source menu: 240 to 380 px. */
const sourceMenuWidthStyle = css({
  minWidth: "[240px]",
  maxWidth: "[380px]",
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
      className={css({
        borderBottomWidth: "thin",
        borderBottomStyle: "solid",
        borderBottomColor: "neutral.bd.subtle",
        // A full-width row, not a boxed input: the focus and hover outline stay off.
        "& *::before": { borderColor: "[transparent !important]" },
      })}
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
  typeValueIcon = "pencil",
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
  // Search only earns its place on a long list; the mocks show short menus without it.
  const longList =
    searchAlways || listsOnly || typedChoicesProp.length + options.length > 8;

  // A list reads "List of Shipments" under its step's name.
  const listName = (option: SourceOption) => {
    const type = findEntityType(
      entityTypeOf(document, option.source, stepId),
    )?.title;
    return type ? `List of ${type}s` : option.label;
  };
  const optionItems = (group: SourceOption["group"]) =>
    (listsOnly ? options.toReversed() : options)
      .filter((option) => option.group === group)
      .map((option) => ({
        id: JSON.stringify(option.source),
        text: listsOnly ? option.ownerLabel : option.label,
        description: listsOnly ? listName(option) : option.ownerLabel,
        icon: ownerIcon(document, option).icon,
        hint: `${option.ownerLabel} › ${option.label} · ${kindLabel(option.shape.payloadKind, option.shape.array)}${option.note ? ` · ${option.note}` : ""}`,
        onPick: () => onPick(option.source),
      }));
  const searching = text !== "";
  const earlier = optionItems("Earlier steps");
  const thisItem = optionItems("This item");
  const flowInputs = optionItems("Flow inputs");
  const nothingFits =
    options.length === 0 && typed.length === 0 && !lookupAllowed;

  /* One model for both renderings: DS Menu groups and items (icon, description, tick). Headers as the team named
     them (22 Oct): Earlier steps, Flow inputs, Lookup in graph. An empty group says why; Flow inputs then offers
     "Add flow input on Start". */
  const groupsModel: SourceGroup[] = [
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
              selected: choice.selected,
              hint: choice.hint,
              onPick: () => onPick(choice.source),
            })),
          },
        ]
      : []),
    ...(fromSteps && (earlier.length > 0 || !searching)
      ? [
          {
            id: "Earlier steps",
            label: "Earlier steps",
            items:
              earlier.length > 0
                ? earlier
                : [
                    {
                      id: "none:earlier",
                      text: `No earlier step gives ${phrase}`,
                      disabled: true,
                    },
                  ],
          },
        ]
      : []),
    ...(thisItem.length > 0
      ? [{ id: "This item", label: "This item", items: thisItem }]
      : []),
    ...(fromSteps && !listsOnly && (flowInputs.length > 0 || !searching)
      ? [
          {
            id: "Flow inputs",
            label: "Flow inputs",
            items:
              flowInputs.length > 0
                ? flowInputs
                : [
                    {
                      id: "none:flow-input",
                      text: `No flow input is ${phrase}`,
                      disabled: true,
                    },
                    {
                      id: "add-flow-input",
                      text: "Add flow input on Start",
                      onPick: goToStart,
                    },
                  ],
          },
        ]
      : []),
    ...(nothingFits
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
                hint: "Adds a Find entities step before this one",
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

  if (query === undefined) {
    // The DS Menu: groups, icons, descriptions and ticks as shipped; the search is its pinned header.
    return (
      <OpenMenu
        anchor={anchor}
        position={position}
        alignToPanel={alignToPanel}
        onClose={onClose}
        label={`Choose ${input.label}`}
        className={sourceMenuWidthStyle}
        header={
          hideSearch || !longList ? undefined : (
            <SearchHeader value={search} onChange={setSearch} />
          )
        }
        items={toMenuItems(groupsModel)}
      />
    );
  }

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
                    {item.text}
                  </div>
                ) : (
                  <button
                    key={item.id}
                    type="button"
                    className={menuRowStyle}
                    title={item.hint}
                    onClick={item.onPick}
                  >
                    {item.icon ? <Icon name={item.icon} size="xs" /> : null}
                    <span className={rowTextStyle}>{item.text}</span>
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
