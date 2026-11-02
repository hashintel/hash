import { useState } from "react";

import { type ItemOrGroup, type MenuItem } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  type CatalogEntry,
  catalog,
  isOffered,
  groupEntries,
  stepGroups,
} from "./catalog";
import {
  START_ID,
  addStep,
  type EditorDocument,
  findStep,
  flattenSteps,
} from "./document";
import { showDebug, useEditor } from "./editor-context";
import { OpenMenu } from "./open-menu";
import { SearchHeader } from "./source-menu";
import { OriginMark } from "./ui";

/** J0.10: the first step added from Start's + offers these three before Recent and Browse all. */
const recommendedFirstSteps = ["queryEntities", "requestReview", "sendEmail"];

/** Where a step comes from, when it is not on main: the mock or open-PR mark as the item's suffix. */
const originSuffix = (entry: CatalogEntry) =>
  !showDebug ? undefined : entry.origin.kind === "open-pr" ? (
    <OriginMark
      label={`#${entry.origin.pr}`}
      hover={`Defined in open PR #${entry.origin.pr}, not on main yet`}
    />
  ) : entry.origin.kind === "mock" ? (
    <OriginMark label="mock" hover={entry.origin.why} />
  ) : undefined;

/** The Figma picker's width, on the DS Menu. */
const pickerWidthStyle = css({
  width: "[240px]",
  // A group's chevron sits at the right edge, as in Figma.
  "& [role=menuitem] > svg:last-child": { marginLeft: "auto" },
});

/**
 * An anchor found when the menu reads it, after mount: a picker opened with the screen has no port in the DOM yet.
 */
const anchorAtPoint = (point: { x: number; y: number }) =>
  ({
    current: {
      getBoundingClientRect: () => new DOMRect(point.x, point.y, 1, 1),
      closest: () => null,
    },
  }) as unknown as React.RefObject<Element | null>;

const anchorBySelector = (selector: string) =>
  Object.defineProperty({}, "current", {
    get: () => globalThis.document.querySelector<HTMLElement>(selector),
  }) as React.RefObject<HTMLElement | null>;

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
      : picker.anchor === "drop" && picker.drop
        ? anchorAtPoint(picker.drop.client)
        : anchorBySelector(
            picker.anchor === "port" && picker.after
              ? `[data-port-add="${picker.after.stepId}:${picker.after.port}"]`
              : `[data-group-add="${picker.parentId ?? ""}"]`,
          );

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
            { steps?: unknown[] } | undefined
        )?.steps?.length ?? 0)
      : 0;
    const { document: next, stepId } = addStep(document, entry.id, {
      after,
      parentId: parentId ?? undefined,
      position:
        parentId && !after
          ? { x: 32 + insideCount * 300, y: 72 }
          : picker.drop &&
              !findStep(document, picker.after?.stepId ?? "")?.parentId
            ? picker.drop.flow
            : after
              ? undefined
              : {
                  x: rightmost + 320,
                  y: document.positions[START_ID]?.y ?? 220,
                },
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
  const browseAll: MenuItem[] = stepGroups.map((group) => {
    const groupSteps = groupEntries(group, available);
    return {
      id: `group:${group.name}`,
      text: group.name,
      icon: group.icon,
      subItems:
        groupSteps.length > 0
          ? groupSteps.map((entry) => entryItem(entry, "browse"))
          : [
              {
                id: `group:${group.name}:none`,
                text: "No steps yet",
                disabled: true,
                onClick: () => undefined,
              },
            ],
    };
  });
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
              : matches.map((entry) => entryItem(entry, "result")),
        },
      ]
    : [
        ...(picker.anchor === "port" && document.steps.length === 0
          ? [
              {
                id: "recommended",
                label: "Recommended",
                items: recommendedFirstSteps.flatMap((id) =>
                  available
                    .filter((entry) => entry.id === id)
                    .map((entry) => entryItem(entry, "recommended")),
                ),
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
      position={picker.anchor === "toolbar" ? "top" : "bottom-start"}
      className={pickerWidthStyle}
      keepInCanvasWidth={picker.anchor === "toolbar" ? undefined : 240}
      onClose={close}
      header={
        <SearchHeader
          value={search}
          onChange={setSearch}
          placeholder="Search"
          focusOnOpen
        />
      }
      items={items}
    />
  );
};

export const stepCount = (document: EditorDocument) =>
  flattenSteps(document.steps).length;
