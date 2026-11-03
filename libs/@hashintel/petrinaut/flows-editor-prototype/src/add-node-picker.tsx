import { useState } from "react";

import { type ItemOrGroup, type MenuItem } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

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
import { tileMenu, tiledRowsStyle } from "./menu-rows";
import { OpenMenu } from "./open-menu";
import { SearchHeader } from "./source-menu";
import { OriginMark } from "./ui";

/** How far Insert step here moves the steps after it: a card and the gap between cards (J1.1: 200 + 96). */
const insertShift = 296;

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

/** Each step row's second line (Figma, 3 Nov), from the engine's action definitions. */
const stepLines: Record<string, string> = {
  queryEntities: "Search one entity type, with conditions",
  createEntity: "Add a new entity to the graph",
  updateEntity: "Change properties on an existing entity",
  requestReview: "Ask someone to approve or reject",
  sendEmail: "Send an email; drafting is a separate step",
  getFileFromUrl: "Download a file from a URL into HASH",
  if: "Send a value to Yes or No by a condition",
  forEach: "Run steps once per item of a list",
  filterList: "Split a list into matching and other items",
};

/** A step Figma gives no line: the first sentence of its definition's description. */
const stepLine = (entry: CatalogEntry) =>
  stepLines[entry.id] ?? entry.description.split(/(?<=\.)\s/)[0]?.replace(/\.$/, "");

/** The Figma picker's width, on the DS Menu: 240 px, or 288 px for a menu with step rows (3 Nov). */
const pickerWidthStyle = css({
  width: "[240px]",
  "&:has([data-menu-row=two])": { width: "[288px]" },
  // A group's chevron sits at the right edge, as in Figma.
  "& [role=menuitem] > svg:last-child": { marginLeft: "auto" },
});

/** A submenu of steps: 288 px (Figma J0.6). */
const stepSubmenuStyle = css({ width: "[288px]" });

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
    // Insert step here (J1.20): the connection now runs through the new step.
    const inserted = picker.insertInto
      ? document.wires.find((wire) => wire.id === picker.insertInto)
      : undefined;
    // The new step takes the target's place; the target and everything right of it moves one column on.
    const targetAt = inserted ? next.positions[inserted.target] : undefined;
    const shifted =
      inserted && targetAt
        ? Object.fromEntries(
            Object.entries(next.positions).map(([id, at]) =>
              id === stepId
                ? [id, targetAt]
                : at.x >= targetAt.x - 1 && !findStep(next, id)?.parentId
                  ? [id, { ...at, x: at.x + insertShift }]
                  : [id, at],
            ),
          )
        : next.positions;
    setDocument(() =>
      inserted
        ? {
            ...next,
            positions: shifted,
            wires: [
              ...next.wires.filter((wire) => wire.id !== inserted.id),
              {
                id: `${stepId}:next->${inserted.target}`,
                source: stepId,
                sourcePort: "next",
                target: inserted.target,
              },
            ],
          }
        : next,
    );
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
    description: stepLine(entry),
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
      menuClassName: cx(stepSubmenuStyle, tiledRowsStyle),
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
      // From a port it opens beside the + when there is room (J0.10), else below it (J1.4).
      besideWhenFits={picker.anchor === "port"}
      className={cx(pickerWidthStyle, tiledRowsStyle)}
      keepInCanvasWidth={
        picker.anchor === "toolbar"
          ? undefined
          : query || recent.length > 0 || document.steps.length === 0
            ? 288
            : 240
      }
      onClose={close}
      header={
        <SearchHeader
          value={search}
          onChange={setSearch}
          placeholder="Search"
          focusOnOpen
        />
      }
      items={tileMenu(items)}
    />
  );
};

export const stepCount = (document: EditorDocument) =>
  flattenSteps(document.steps).length;
