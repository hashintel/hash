import { useState } from "react";

import { Popover, TextInput } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

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
} from "./document";
import { useEditor } from "./editor-context";
import { canConnect, type ConnectionSource, type PayloadKind } from "./engine";
import {
  type TriggerKind,
  triggerDefinitions,
  triggerKinds,
} from "./mock-triggers";
import { getItemShape, getSourceShape, triggerFlowInputs } from "./shapes";
import { IconTile, OriginMark } from "./ui";

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

const rowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  width: "[100%]",
  paddingX: "2",
  paddingY: "[5px]",
  borderRadius: "md",
  textAlign: "left",
  cursor: "pointer",
  fontSize: "sm",
  color: "neutral.s120",
  _hover: { backgroundColor: "neutral.s15" },
  _focusVisible: { backgroundColor: "neutral.s15", outline: "none" },
});

const groupLabelStyle = css({
  fontSize: "[11px]",
  fontWeight: "semibold",
  color: "neutral.s90",
  textTransform: "uppercase",
  letterSpacing: "[0.04em]",
  paddingX: "2",
  paddingTop: "3",
  paddingBottom: "1",
});

const EntryRow = ({
  entry,
  onPick,
}: {
  entry: CatalogEntry;
  onPick: (entry: CatalogEntry) => void;
}) => (
  <button
    type="button"
    className={rowStyle}
    title={entry.description}
    onClick={() => onPick(entry)}
  >
    <IconTile icon={entry.icon} tone={entry.tone} size="sm" />
    <span className={css({ flex: "1" })}>{entry.title}</span>
    {entry.origin.kind === "open-pr" ? (
      <OriginMark
        label={`#${entry.origin.pr}`}
        hover={`Defined in open PR #${entry.origin.pr}, not on main yet`}
      />
    ) : entry.origin.kind === "mock" ? (
      <OriginMark label="mock" hover={entry.origin.why} />
    ) : null}
  </button>
);

/** A trigger in the picker: added to the left column and wired to the first actions. */
const TriggerRow = ({
  kind,
  onPick,
}: {
  kind: TriggerKind;
  onPick: (kind: TriggerKind) => void;
}) => {
  const definition = triggerDefinitions[kind];
  return (
    <button type="button" className={rowStyle} onClick={() => onPick(kind)}>
      <IconTile icon={definition.icon} tone="blue" size="sm" />
      <span className={css({ flex: "1" })}>{definition.title}</span>
      {definition.mock ? (
        <OriginMark label="mock" hover="No such trigger on main yet." />
      ) : null}
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
  };

  const query = search.trim().toLowerCase();
  const recommended = recommendedFor(document, picker.after, picker.parentId);
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
  };
  const matches = available.filter(
    (entry) =>
      entry.title.toLowerCase().includes(query) ||
      entry.category.toLowerCase().includes(query),
  );

  return (
    <Popover
      triggerRef={anchor}
      position={picker.anchor === "toolbar" ? "top" : "right-start"}
      gapY={8}
      gapX={8}
      onClose={close}
    >
      <div
        role="dialog"
        aria-label="Add node"
        className={css({
          width: "[320px]",
          maxHeight: "[440px]",
          overflowY: "auto",
          backgroundColor: "neutral.s00",
          borderWidth: "thin",
          borderStyle: "solid",
          borderColor: "neutral.s40",
          borderRadius: "lg",
          boxShadow: "[0 8px 24px rgba(0, 0, 0, 0.12)]",
          padding: "2",
        })}
      >
        <TextInput
          value={search}
          onChange={(value) => setSearch(value)}
          placeholder="Search steps"
          size="sm"
        />
        {query ? (
          <div className={css({ paddingTop: "2" })}>
            {triggerChoices.map((kind) => (
              <TriggerRow key={kind} kind={kind} onPick={pickTrigger} />
            ))}
            {matches.length === 0 && triggerChoices.length === 0 ? (
              <div
                className={css({
                  padding: "3",
                  fontSize: "sm",
                  color: "neutral.s90",
                })}
              >
                No step matches “{search}”.
              </div>
            ) : (
              matches.map((entry) => (
                <EntryRow key={entry.id} entry={entry} onPick={pick} />
              ))
            )}
          </div>
        ) : (
          <>
            <div className={groupLabelStyle}>Recommended</div>
            {recommended
              .filter((entry) => available.includes(entry))
              .map((entry) => (
                <EntryRow key={entry.id} entry={entry} onPick={pick} />
              ))}
            {recent.length > 0 ? (
              <>
                <div className={groupLabelStyle}>Recent</div>
                {recent.map((entry) => (
                  <EntryRow key={entry.id} entry={entry} onPick={pick} />
                ))}
              </>
            ) : null}
            <div className={groupLabelStyle}>Browse all</div>
            {triggerChoices.length > 0 ? (
              <div>
                <div
                  className={css({
                    fontSize: "xs",
                    color: "neutral.s90",
                    paddingX: "2",
                    paddingTop: "2",
                  })}
                >
                  Triggers
                </div>
                {triggerChoices.map((kind) => (
                  <TriggerRow key={kind} kind={kind} onPick={pickTrigger} />
                ))}
              </div>
            ) : null}
            {categories.map((category) => {
              const entries = available.filter(
                (entry) => entry.category === category,
              );
              return entries.length === 0 ? null : (
                <div key={category}>
                  <div
                    className={css({
                      fontSize: "xs",
                      color: "neutral.s90",
                      paddingX: "2",
                      paddingTop: "2",
                    })}
                  >
                    {category}
                  </div>
                  {entries.map((entry) => (
                    <EntryRow key={entry.id} entry={entry} onPick={pick} />
                  ))}
                </div>
              );
            })}
          </>
        )}
      </div>
    </Popover>
  );
};

export const stepCount = (document: EditorDocument) =>
  flattenSteps(document.steps).length;
