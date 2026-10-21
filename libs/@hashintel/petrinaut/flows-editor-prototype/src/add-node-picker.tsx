import { useState } from "react";

import {
  Icon,
  type IconName,
  Popover,
  TextInput,
} from "@hashintel/ds-components";
import { css, cva, cx } from "@hashintel/ds-helpers/css";

import { OverlayScrollArea } from "../../src/ui/components/overlay-scroll-area";
import {
  type CatalogEntry,
  catalog,
  categories,
  popularFirstSteps,
} from "./catalog";
import {
  START_ID,
  addTrigger,
  addStep,
  type EditorDocument,
  findStep,
  flattenSteps,
  stepTitle,
} from "./document";
import { useEditor } from "./editor-context";
import { canConnect, type ConnectionSource, type PayloadKind } from "./engine";
import {
  type TriggerKind,
  triggerDefinitions,
  triggerKinds,
} from "./mock-triggers";
import { getItemShape, getSourceShape, triggerFlowInputs } from "./shapes";
import { fieldStyle, OriginMark } from "./ui";

/** The values a new step could take, given where it goes: the earlier step's outputs, the flow inputs, the item. */
const availableShapes = (
  document: EditorDocument,
  after: { stepId: string; port: string } | undefined,
  parentId: string | null | undefined,
): ConnectionSource[] => {
  if (parentId && !after) {
    const shape = getItemShape(document, parentId);
    return shape ? [shape] : [];
  }
  if (!after) {
    return [];
  }
  if (after.stepId === START_ID) {
    return triggerFlowInputs(document).map(({ input }) => ({
      payloadKind: input.payloadKind,
      array: input.array,
      required: input.required,
    }));
  }
  const step = findStep(document, after.stepId)?.step;
  if (!step) {
    return [];
  }
  if (step.kind === "for-each") {
    return step.collect
      ? [
          getSourceShape(
            document,
            {
              kind: "step-output",
              stepId: step.stepId,
              outputName: step.collect.as,
            },
            after.stepId,
          ),
        ].filter((shape): shape is ConnectionSource => !!shape)
      : [];
  }
  const outputs =
    catalog.find((entry) => entry.id === step.actionDefinitionId)?.outputs ??
    [];
  // A branch port passes on only the output it stands for.
  const relevant =
    after.port === "next"
      ? outputs
      : outputs.filter((output) => output.name === after.port);
  return relevant
    .map((output) =>
      getSourceShape(
        document,
        { kind: "step-output", stepId: step.stepId, outputName: output.name },
        step.stepId,
      ),
    )
    .filter((shape): shape is ConnectionSource => !!shape);
};

const fits = (entry: CatalogEntry, shapes: ConnectionSource[]) =>
  shapes.some(
    (shape) =>
      (entry.id === "forEach" && shape.array) ||
      entry.inputs.some((input) => {
        if (!input.kinds) {
          return false;
        }
        const target = {
          oneOfPayloadKinds: input.kinds as PayloadKind[],
          array: input.array,
          required: input.required,
        };
        return (
          canConnect({ source: shape, target, skipWhenMissing: true }).ok ||
          (!shape.array &&
            canConnect({
              source: shape,
              target,
              wrap: true,
              skipWhenMissing: true,
            }).ok)
        );
      }),
  );

/**
 * "Recommended" (Dei, 20 Oct): popular first steps on an empty flow; otherwise the steps that can take what the
 * step before gives, as the engine's `canConnect` decides. The real rule belongs in a PRD.
 */
const recommendedFor = (
  document: EditorDocument,
  after: { stepId: string; port: string } | undefined,
  parentId: string | null | undefined,
): CatalogEntry[] => {
  const shapes = availableShapes(document, after, parentId);
  if (shapes.length === 0) {
    return popularFirstSteps.flatMap((id) =>
      catalog.filter((entry) => entry.id === id),
    );
  }
  // Manual journeys only for now: AI steps stay in Browse all but are never recommended.
  const fitting = catalog.filter(
    (entry) => entry.category !== "AI" && fits(entry, shapes),
  );
  // A list feeds a single-value input only through For each, so offer it first.
  fitting.sort(
    (a, b) => Number(b.id === "forEach") - Number(a.id === "forEach"),
  );
  return fitting.slice(0, 4);
};

/** Scratch · Add step panel, L2: 13 px rows, 6 px in, 5 px tall padding, 6 px corners, a 22 px tinted tile. */
const rowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  width: "[100%]",
  paddingX: "1.5",
  paddingY: "[5px]",
  borderRadius: "md",
  textAlign: "left",
  cursor: "pointer",
  fontSize: "[13px]",
  lineHeight: "[16px]",
  color: "neutral.s120",
  whiteSpace: "nowrap",
  _hover: { backgroundColor: "neutral.a30" },
  _focusVisible: { backgroundColor: "neutral.a30", outline: "none" },
  "&[data-first]": { backgroundColor: "neutral.a30" },
});

/** 10 px semibold caps, muted, with 6 px above it. */
const groupLabelStyle = css({
  fontSize: "[10px]",
  lineHeight: "[12px]",
  fontWeight: "semibold",
  color: "neutral.s100",
  textTransform: "uppercase",
  letterSpacing: "[0.4px]",
  paddingTop: "1.5",
  paddingBottom: "0.5",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const sideTextStyle = css({
  marginLeft: "auto",
  fontSize: "[11px]",
  color: "neutral.s100",
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  "& svg": { width: "[10px]", height: "[10px]" },
});

const pickerTileStyle = cva({
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    width: "[22px]",
    height: "[22px]",
    borderRadius: "md",
    "&[class] svg": {
      width: "[13px]",
      height: "[13px]",
      "--icon-size": "13px",
    },
  },
  variants: {
    tone: {
      green: { backgroundColor: "green.s30", color: "green.s100" },
      orange: { backgroundColor: "orange.s30", color: "orange.s100" },
      blue: { backgroundColor: "blue.s30", color: "blue.s100" },
      neutral: { backgroundColor: "neutral.s30", color: "neutral.s100" },
    },
  },
});

const PickerTile = ({
  icon,
  tone,
}: {
  icon: IconName;
  tone: "green" | "orange" | "neutral" | "blue";
}) => (
  <span className={pickerTileStyle({ tone })}>
    <Icon name={icon} size="sm" />
  </span>
);

/** Each group's row in Browse all: its own tile, as the Scratch E1 list draws them. */
const groupLooks: Record<
  string,
  { icon: IconName; tone: "green" | "orange" | "neutral" | "blue" }
> = {
  Triggers: { icon: "lightning", tone: "blue" },
  Entities: { icon: "cube", tone: "green" },
  Logic: { icon: "diagramSubtask", tone: "orange" },
  AI: { icon: "sparkles", tone: "blue" },
  "Files and web": { icon: "fileLines", tone: "orange" },
  Messages: { icon: "at", tone: "green" },
};

/** The Scratch L2 search popover: 330 wide, 8 px in, 10 px corners, a soft wide shadow. */
const pickerStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "0.5",
  width: "[330px]",
  padding: "2",
  backgroundColor: "neutral.s00",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.a50",
  borderRadius: "[10px]",
  boxShadow: "[0 6px 18px rgba(0, 0, 0, 0.12)]",
});

const EntryRow = ({
  entry,
  onPick,
  side,
  first,
}: {
  entry: CatalogEntry;
  onPick: (entry: CatalogEntry) => void;
  /** Shown on the right, e.g. the group in search results. */
  side?: string;
  first?: boolean;
}) => (
  <button
    type="button"
    className={rowStyle}
    title={entry.description}
    data-first={first || undefined}
    onClick={() => onPick(entry)}
  >
    <PickerTile icon={entry.icon} tone={entry.tone} />
    <span>{entry.title}</span>
    {entry.origin.kind === "open-pr" ? (
      <OriginMark
        label={`#${entry.origin.pr}`}
        hover={`Defined in open PR #${entry.origin.pr}, not on main yet`}
      />
    ) : entry.origin.kind === "mock" ? (
      <OriginMark label="mock" hover={entry.origin.why} />
    ) : null}
    {side ? <span className={sideTextStyle}>{side}</span> : null}
  </button>
);

/** A trigger in the picker: added left of Start and wired into it. */
const TriggerRow = ({
  kind,
  onPick,
  side,
  first,
}: {
  kind: TriggerKind;
  onPick: (kind: TriggerKind) => void;
  side?: string;
  first?: boolean;
}) => {
  const definition = triggerDefinitions[kind];
  return (
    <button
      type="button"
      className={rowStyle}
      data-first={first || undefined}
      onClick={() => onPick(kind)}
    >
      <PickerTile icon={definition.icon} tone="blue" />
      <span>{definition.title}</span>
      {definition.mock ? (
        <OriginMark label="mock" hover="No such trigger on main yet." />
      ) : null}
      {side ? <span className={sideTextStyle}>{side}</span> : null}
    </button>
  );
};

/** A group in Browse all: tile, name, count and a chevron that drills in. */
const GroupRow = ({
  name,
  count,
  onOpen,
}: {
  name: string;
  count: number;
  onOpen: () => void;
}) => {
  const look = groupLooks[name] ?? { icon: "cube", tone: "neutral" };
  return (
    <button type="button" className={rowStyle} onClick={onOpen}>
      <PickerTile icon={look.icon} tone={look.tone} />
      <span>{name}</span>
      <span className={sideTextStyle}>
        {count}
        <Icon name="chevronRight" size="xs" />
      </span>
    </button>
  );
};

export const AddNodePicker = ({
  toolbarAnchor,
}: {
  toolbarAnchor: React.RefObject<HTMLElement | null>;
}) => {
  const { document, setDocument, ui, setUi } = useEditor();
  const [search, setSearch] = useState("");
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const picker = ui.picker;
  if (!picker) {
    return null;
  }

  const anchor =
    picker.anchor === "toolbar"
      ? toolbarAnchor
      : {
          current: globalThis.document.querySelector<HTMLElement>(
            picker.anchor === "port" && picker.after
              ? `[data-port-add="${picker.after.stepId}:${picker.after.port}"]`
              : `[data-group-add="${picker.parentId ?? ""}"]`,
          ),
        };

  const close = () => {
    setSearch("");
    setOpenGroup(null);
    setUi((current) => ({ ...current, picker: null }));
  };

  const pick = (entry: CatalogEntry) => {
    const selected = ui.selectedId;
    const selectedStep = selected ? findStep(document, selected) : undefined;
    // From the toolbar: after the selected step, or after the end of the main line when nothing is selected.
    const danglingEnd = [...document.steps]
      .reverse()
      .map((step) => step.stepId)
      .concat(START_ID)
      .find((id) => !document.wires.some((wire) => wire.source === id));
    const after =
      picker.after ??
      (picker.anchor !== "toolbar"
        ? undefined
        : selected && selectedStep?.step.kind !== "for-each"
          ? { stepId: selected, port: "next" }
          : selected === START_ID
            ? { stepId: START_ID, port: "next" }
            : !selected && danglingEnd
              ? { stepId: danglingEnd, port: "next" }
              : undefined);
    const rightmost = Math.max(
      0,
      ...[START_ID, ...document.steps.map((step) => step.stepId)].map(
        (id) => document.positions[id]?.x ?? 0,
      ),
    );
    const parentId = picker.parentId;
    const insideCount = parentId
      ? ((
          findStep(document, parentId)?.step as
            | { steps?: unknown[] }
            | undefined
        )?.steps?.length ?? 0)
      : 0;
    const { document: next, stepId } = addStep(document, entry.id, {
      after,
      parentId: parentId ?? undefined,
      position:
        parentId && !after
          ? { x: 32 + insideCount * 300, y: 72 }
          : after
            ? undefined
            : { x: rightmost + 320, y: document.positions[START_ID]?.y ?? 220 },
    });
    setDocument(() => next);
    setUi((current) => ({
      ...current,
      picker: null,
      selectedId: stepId,
      recent: [
        entry.id,
        ...current.recent.filter((id) => id !== entry.id),
      ].slice(0, 4),
    }));
    setSearch("");
    setOpenGroup(null);
  };

  const query = search.trim().toLowerCase();
  const recent = ui.recent.flatMap((id) =>
    catalog.filter((entry) => entry.id === id),
  );
  const inGroup =
    !!picker.parentId ||
    (picker.after && findStep(document, picker.after.stepId)?.parentId);
  // The engine runs no for-each inside another ("nestedForEach"), so the picker leaves it out there.
  const available = catalog.filter(
    (entry) => !(inGroup && entry.id === "forEach"),
  );
  // Triggers start the flow, so they're only offered from the toolbar, not after a step. One Manual run per flow.
  const triggerChoices = (
    picker.anchor === "toolbar" ? triggerKinds : []
  ).filter(
    (kind) =>
      !query ||
      triggerDefinitions[kind].title.toLowerCase().includes(query) ||
      "triggers".includes(query),
  );
  const pickTrigger = (kind: TriggerKind) => {
    const { document: next, triggerId } = addTrigger(document, kind);
    setDocument(() => next);
    setUi((current) => ({ ...current, picker: null, selectedId: triggerId }));
    setSearch("");
    setOpenGroup(null);
  };
  const matches = available.filter(
    (entry) =>
      entry.title.toLowerCase().includes(query) ||
      entry.category.toLowerCase().includes(query),
  );

  // "Fits after <step>" when the picker knows where the step goes; on an empty flow, the usual first steps.
  const afterId =
    picker.after?.stepId ??
    (picker.anchor === "toolbar" ? (ui.selectedId ?? undefined) : undefined);
  const afterName =
    afterId === START_ID
      ? "Start"
      : afterId
        ? (() => {
            const found = findStep(document, afterId)?.step;
            return found ? stepTitle(found) : undefined;
          })()
        : undefined;
  const suggested = recommendedFor(
    document,
    picker.after ??
      (afterId && findStep(document, afterId)?.step.kind !== "for-each"
        ? { stepId: afterId, port: "next" }
        : afterId === START_ID
          ? { stepId: START_ID, port: "next" }
          : undefined),
    picker.parentId,
  ).filter((entry) => available.includes(entry));
  const suggestedLabel =
    afterName && availableShapes(document, picker.after, picker.parentId)
      ? `Fits after ${afterName}`
      : picker.parentId
        ? "Fits inside this group"
        : "Start with";
  const groups = [
    ...(picker.anchor === "toolbar"
      ? [{ name: "Triggers", count: triggerKinds.length }]
      : []),
    ...categories
      .map((category) => ({
        name: category as string,
        count: available.filter((entry) => entry.category === category).length,
      }))
      .filter((group) => group.count > 0),
  ];

  return (
    <Popover
      triggerRef={anchor}
      position={picker.anchor === "toolbar" ? "top" : "right-start"}
      gapY={8}
      gapX={8}
      onClose={close}
    >
      <div role="dialog" aria-label="Add node" className={pickerStyle}>
        <TextInput
          value={search}
          onChange={(value) => {
            setSearch(value);
            setOpenGroup(null);
          }}
          placeholder="Search steps"
          size="sm"
          className={fieldStyle}
          prefix={{ iconName: "search", variant: "subtle" }}
        />
        <OverlayScrollArea className={css({ maxHeight: "[380px]" })}>
          <div
            className={css({
              display: "flex",
              flexDirection: "column",
              gap: "0.5",
              paddingTop: "1",
            })}
          >
            {query ? (
              <>
                {triggerChoices.map((kind, index) => (
                  <TriggerRow
                    key={kind}
                    kind={kind}
                    onPick={pickTrigger}
                    side="Triggers"
                    first={index === 0}
                  />
                ))}
                {matches.length === 0 && triggerChoices.length === 0 ? (
                  <div
                    className={css({
                      paddingX: "1.5",
                      paddingY: "2",
                      fontSize: "[13px]",
                      color: "neutral.s90",
                    })}
                  >
                    No step matches “{search}”.
                  </div>
                ) : (
                  matches.map((entry, index) => (
                    <EntryRow
                      key={entry.id}
                      entry={entry}
                      onPick={pick}
                      side={entry.category}
                      first={index === 0 && triggerChoices.length === 0}
                    />
                  ))
                )}
              </>
            ) : openGroup ? (
              <>
                <button
                  type="button"
                  className={cx(rowStyle, groupLabelStyle)}
                  onClick={() => setOpenGroup(null)}
                  aria-label="Back to all groups"
                >
                  <Icon name="chevronLeft" size="xs" />
                  {openGroup}
                </button>
                {openGroup === "Triggers"
                  ? triggerKinds.map((kind, index) => (
                      <TriggerRow
                        key={kind}
                        kind={kind}
                        onPick={pickTrigger}
                        first={index === 0}
                      />
                    ))
                  : available
                      .filter((entry) => entry.category === openGroup)
                      .map((entry, index) => (
                        <EntryRow
                          key={entry.id}
                          entry={entry}
                          onPick={pick}
                          first={index === 0}
                        />
                      ))}
              </>
            ) : (
              <>
                {suggested.length > 0 ? (
                  <>
                    <div className={groupLabelStyle}>{suggestedLabel}</div>
                    {suggested.map((entry, index) => (
                      <EntryRow
                        key={entry.id}
                        entry={entry}
                        onPick={pick}
                        first={index === 0}
                      />
                    ))}
                  </>
                ) : null}
                {recent.length > 0 ? (
                  <>
                    <div className={groupLabelStyle}>Recent</div>
                    {recent.map((entry) => (
                      <EntryRow key={entry.id} entry={entry} onPick={pick} />
                    ))}
                  </>
                ) : null}
                <div className={groupLabelStyle}>Browse all</div>
                {groups.map((group) => (
                  <GroupRow
                    key={group.name}
                    name={group.name}
                    count={group.count}
                    onOpen={() => setOpenGroup(group.name)}
                  />
                ))}
              </>
            )}
          </div>
        </OverlayScrollArea>
      </div>
    </Popover>
  );
};

export const stepCount = (document: EditorDocument) =>
  flattenSteps(document.steps).length;
