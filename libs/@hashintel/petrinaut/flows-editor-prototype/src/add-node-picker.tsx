import { useState } from "react";

import {
  type IconName,
  type ItemOrGroup,
  type MenuItem,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  type CatalogEntry,
  catalog,
  categories,
  isOffered,
  popularFirstSteps,
} from "./catalog";
import {
  START_ID,
  addStep,
  type EditorDocument,
  findStep,
  flattenSteps,
  stepTitle,
} from "./document";
import { useEditor } from "./editor-context";
import { canConnect, type ConnectionSource, type PayloadKind } from "./engine";
import { OpenMenu } from "./open-menu";
import { getItemShape, getSourceShape, triggerFlowInputs } from "./shapes";
import { SearchHeader } from "./source-menu";
import { OriginMark } from "./ui";

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
  // Manual journeys only for now (ledger, 21 Oct): AI steps are not offered anywhere.
  const fitting = catalog.filter(
    (entry) => isOffered(entry) && fits(entry, shapes),
  );
  // A list feeds a single-value input only through For each, so offer it first.
  fitting.sort(
    (a, b) => Number(b.id === "forEach") - Number(a.id === "forEach"),
  );
  return fitting.slice(0, 4);
};

/** Each group's row in Browse all: its icon, as the Scratch E1 list draws them. */
const groupIcons: Record<string, IconName> = {
  Entities: "cube",
  Logic: "diagramSubtask",
  "Files and web": "fileLines",
  Messages: "at",
};

/** Where a step comes from, when it is not on main: the mock or open-PR mark as the item's suffix. */
const originSuffix = (entry: CatalogEntry) =>
  entry.origin.kind === "open-pr" ? (
    <OriginMark
      label={`#${entry.origin.pr}`}
      hover={`Defined in open PR #${entry.origin.pr}, not on main yet`}
    />
  ) : entry.origin.kind === "mock" ? (
    <OriginMark label="mock" hover={entry.origin.why} />
  ) : undefined;

/** The Scratch L2 picker's width, on the DS Menu. */
const pickerWidthStyle = css({ width: "[330px]" });

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
  const recent = ui.recent.flatMap((id) =>
    catalog.filter((entry) => entry.id === id),
  );
  const inGroup =
    !!picker.parentId ||
    (picker.after && findStep(document, picker.after.stepId)?.parentId);
  // The engine runs no for-each inside another ("nestedForEach"), so the picker leaves it out there.
  const available = catalog.filter(
    (entry) => isOffered(entry) && !(inGroup && entry.id === "forEach"),
  );
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
  const suggestedLabel = afterName
    ? `Fits after ${afterName}`
    : picker.parentId
      ? "Fits inside this group"
      : "Start with";

  /* DS Menu items: a step, and a Browse all group that opens its steps as a DS submenu. */
  const entryItem = (
    entry: CatalogEntry,
    key: string,
    side?: string,
  ): MenuItem => ({
    id: `${key}:${entry.id}`,
    text: entry.title,
    icon: entry.icon,
    suffix: originSuffix(entry) ?? side,
    onClick: () => pick(entry),
  });
  const browseAll: MenuItem[] = [
    ...categories.flatMap((category) => {
      const inCategory = available.filter(
        (entry) => entry.category === category,
      );
      return inCategory.length === 0
        ? []
        : [
            {
              id: `group:${category}`,
              text: category,
              icon: groupIcons[category] ?? ("cube" as const),
              subItems: inCategory.map((entry) => entryItem(entry, "browse")),
            },
          ];
    }),
  ];
  const items: Array<ItemOrGroup<MenuItem>> = query
    ? [
        {
          id: "results",
          label: "",
          items:
            matches.length === 0
              ? [
                  {
                    id: "nothing",
                    text: `No step matches “${search}”`,
                    disabled: true,
                    onClick: () => undefined,
                  },
                ]
              : [
                  ...matches.map((entry) =>
                    entryItem(entry, "result", entry.category),
                  ),
                ],
        },
      ]
    : [
        ...(suggested.length > 0
          ? [
              {
                id: "suggested",
                label: suggestedLabel,
                items: suggested.map((entry) => entryItem(entry, "suggested")),
              },
            ]
          : []),
        ...(recent.length > 0
          ? [
              {
                id: "recent",
                label: "Recent",
                items: recent.map((entry) => entryItem(entry, "recent")),
              },
            ]
          : []),
        { id: "browse", label: "Browse all", items: browseAll },
      ];

  return (
    <OpenMenu
      anchor={anchor}
      label="Add node"
      position={picker.anchor === "toolbar" ? "top" : "right-start"}
      className={pickerWidthStyle}
      onClose={close}
      header={
        <SearchHeader
          value={search}
          onChange={setSearch}
          placeholder="Search steps"
          focusOnOpen
        />
      }
      items={items}
    />
  );
};

export const stepCount = (document: EditorDocument) =>
  flattenSteps(document.steps).length;
