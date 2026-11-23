import { useRef, useState } from "react";

import {
  Button,
  Icon,
  Menu,
  PortalContainerContext,
  TextInput,
} from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";
import { Zap } from "lucide-react";

import { rowButtonActiveStyle, rowButtonStyle } from "./all-runs";
import { ConfirmDialog, useConfirmTake } from "./confirm-dialog";
import { Table } from "./ds-parts/table";
import { Toast } from "./ds-parts/toast";
import { flowTriggersOf } from "./flow-triggers";
import { HashShell } from "./hash-shell";
import { GreyBar, loadingOn } from "./loading-state";
import { selectedLabel } from "./menu-rows";
import { iconStroke } from "./thin-icons";
import { RunGlyph } from "./run-glyph";
import { RunIdsIn } from "./run-id";
import {
  appliedChips,
  FilterByMenu,
  newChip,
  type RunFilterChip,
  RunsFilterRibbon,
} from "./runs-filter";
import { VersionLabel, versionLabel } from "./versions";

import type { EditorDocument } from "./document";
import type { ItemProgress, StepState } from "./run-history";

export type FlowListEntry = {
  id: string;
  document: EditorDocument;
  /** J0.2's "Last edited" column. */
  lastEdited: string;
  version?: ReturnType<typeof versionLabel>;
  /** The newest run: its mark and "Run 17 · Today 10:42", or none yet. */
  lastRun?: { state: StepState; label: string; progress?: ItemProgress };
  runCount?: number;
};

/** J0.1's empty state and J0.2's table share this frame: 1200 wide, 12 px corners, a hairline. */
const boxStyle = css({
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "xl",
  overflow: "hidden",
});

/** The DS table on J0.2: a 32 px grey header row, 48 px rows, hairline dividers. */
const tableStyle = css({
  width: "[100%]",
  borderCollapse: "collapse",
  "& th": {
    height: "[32px]",
    paddingX: "3",
    textAlign: "left",
    textStyle: "xs",
    lineHeight: "[12px]",
    fontWeight: "medium",
    color: "neutral.fg.heading",
    backgroundColor: "neutral.bgSolid.surface.hover",
    borderBottomWidth: "thin",
    borderBottomStyle: "solid",
    borderBottomColor: "neutral.bgSolid.subtle",
  },
  "& td": {
    height: "[48px]",
    paddingX: "3",
    textStyle: "sm",
    lineHeight: "[14px]",
    fontWeight: "medium",
    borderBottomWidth: "thin",
    borderBottomStyle: "solid",
    borderBottomColor: "neutral.bgSolid.subtle",
  },
  "& tr:last-child td": { borderBottomWidth: "[0]" },
  "& th:first-child, & td:first-child": { paddingLeft: "6" },
  "& tbody tr": {
    cursor: "pointer",
    _hover: { backgroundColor: "neutral.bgSolid.surface.hover" },
  },
});

/** `?list=old` brings back the list as it was before the F9 ribbon design (17-18 Nov). */
const oldList =
  new URLSearchParams(globalThis.location.search).get("list") === "old";

type BoardStarter =
  | { kind: "person" | "schedule" | "responsive"; text: string }
  | undefined;

/** The seven rows of Paper board F9-RIBBON, as drawn. */
const boardRows: {
  name: string;
  web: string;
  version: ReturnType<typeof versionLabel>;
  status?: {
    state: StepState;
    word: string;
    progress?: ItemProgress;
  };
  when: string;
  starter: BoardStarter;
  runs: string;
  edited: string;
  editor: string;
}[] = [
  {
    name: "Monthly supplier review",
    web: "@hash",
    version: { number: "v6", state: "Draft" },
    status: { state: "running", word: "Running" },
    when: "Today, 10:42",
    starter: { kind: "person", text: "Dora" },
    runs: "17",
    edited: "Today, 08:02",
    editor: "Dora",
  },
  {
    name: "Purity check",
    web: "@hash",
    version: { number: "v3", state: "Live" },
    status: { state: "needsReview", word: "Needs review" },
    when: "Today, 09:30",
    starter: { kind: "responsive", text: "When a Shipment changes" },
    runs: "9",
    edited: "2 Nov",
    editor: "Maya Patel",
  },
  {
    name: "Supplier certificates",
    web: "@hash",
    version: { number: "v2", state: "Live" },
    status: { state: "failed", word: "Failed" },
    when: "Today, 07:40",
    starter: { kind: "person", text: "Maya Patel" },
    runs: "12",
    edited: "Yesterday",
    editor: "Tom Okafor",
  },
  {
    name: "Quality incident follow-up",
    web: "@dora",
    version: { number: "v3", state: "Draft" },
    status: {
      state: "doneWithFailures",
      word: "2 of 20 failed",
      progress: { done: 18, failed: 2, total: 20 },
    },
    when: "Yesterday, 16:05",
    starter: { kind: "responsive", text: "When an Incident is created" },
    runs: "5",
    edited: "30 Oct",
    editor: "Dora",
  },
  {
    name: "Weekly stock summary",
    web: "@hash",
    version: { number: "v4", state: "Live" },
    status: { state: "done", word: "Done" },
    when: "26 Oct, 08:00",
    starter: { kind: "schedule", text: "Every Monday at 08:00" },
    runs: "8",
    edited: "26 Oct",
    editor: "Maya Patel",
  },
  {
    name: "New shipment intake",
    web: "@hash",
    version: { number: "v1", state: "Draft" },
    status: { state: "abandoned", word: "Cancelled" },
    when: "Today, 09:12",
    starter: { kind: "person", text: "Tom Okafor" },
    runs: "2",
    edited: "Today, 10:15",
    editor: "Dora",
  },
  {
    name: "Untitled flow",
    web: "@aakarsh",
    version: { number: "v1", state: "Draft" },
    when: "",
    starter: undefined,
    runs: "–",
    edited: "Just now",
    editor: "Aakarsh",
  },
];

type ListRow = {
  id: string;
  name: string;
  web: string;
  version: ReturnType<typeof versionLabel> | undefined;
  status: (typeof boardRows)[number]["status"];
  when: string;
  starter: BoardStarter;
  runs: string;
  edited: string;
  editor: string;
};

/** The seeded flows' ids, so a row finds its F9 columns by flow id and a rename leaves them as they were. */
const drawnNames: Record<string, string> = {
  "monthly-supplier-review": "Monthly supplier review",
  "purity-check": "Purity check",
  "supplier-certificates": "Supplier certificates",
  "quality-incident-follow-up": "Quality incident follow-up",
  "weekly-stock-summary": "Weekly stock summary",
  "new-shipment-intake": "New shipment intake",
};

/**
 * One list row per flow in the store, so an archived flow leaves and a new one arrives. The columns F9 draws for the
 * seeded flows come from `boardRows`, found by flow id; any other flow reads what the store knows and shows No runs yet.
 */
const rowFor = (flow: FlowListEntry): ListRow => {
  const name = flow.document.name;
  const drawn = boardRows.find((row) => row.name === drawnNames[flow.id]);
  return {
    id: flow.id,
    name,
    web: drawn?.web ?? "@aakarsh",
    version: flow.version ?? drawn?.version,
    status: drawn?.status,
    when: drawn?.when ?? "",
    starter: drawn?.starter,
    runs: drawn?.runs ?? (flow.runCount ? `${flow.runCount}` : "–"),
    edited: flow.lastEdited === "Just now" ? "Just now" : (drawn?.edited ?? flow.lastEdited),
    editor: drawn?.editor ?? "Aakarsh",
  };
};

/** The words a Status filter offers, one per kind of newest run. */
const statusKinds: Record<string, string> = {
  running: "Running",
  needsReview: "Needs review",
  failed: "Failed",
  doneWithFailures: "Some items failed",
  done: "Done",
  abandoned: "Cancelled",
  none: "No runs yet",
};

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Today, 10:42", "Yesterday, 16:05" or "26 Oct, 08:00" as minutes, for sorting by time; no run is below every run. */
const whenMinutes = (when: string) => {
  const match = /^(Today|Yesterday|(\d{1,2}) (\w{3})), (\d{2}):(\d{2})$/.exec(when);
  if (!match) {
    return -1;
  }
  const now = new Date();
  const day =
    match[1] === "Today"
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
      : match[1] === "Yesterday"
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
        : new Date(now.getFullYear(), months.indexOf(match[3]!), Number(match[2]));
  return day.getTime() / 60000 + Number(match[4]) * 60 + Number(match[5]);
};

/** Filters saved with Save: the ribbon opens on them the next time the list opens in this session (as on Logs). */
let savedChips: RunFilterChip[] = [];

const statusKindOf = (row: ListRow) => row.status?.state ?? "none";

/** What each Flows list filter reads off a row, for "is" and "is not". */
const facetOf = (row: ListRow, property: RunFilterChip["property"]) =>
  property === "web" ? row.web : property === "version" ? row.version?.number : statusKindOf(row);

const listFilterProperties = ["status", "web", "version"] as const;

type ListSortKey = "lastRun" | "name" | "runs";

const listSorts: Record<ListSortKey, { label: string; orders: [string, string] }> = {
  lastRun: { label: "Last run", orders: ["Newest first", "Oldest first"] },
  name: { label: "Name", orders: ["A to Z", "Z to A"] },
  runs: { label: "Runs", orders: ["Most first", "Fewest first"] },
};

/** The shared table with the Triggers page's row behaviour: a pointer, #F9F9F9 on hover. */
const flowsTableStyle = css({
  "& tr[data-row]": {
    cursor: "pointer",
    _hover: { backgroundColor: "neutral.bg.subtle.hover" },
  },
  "& tr:last-child td": { borderBottomWidth: "[0]" },
});

const archiveBody = (triggers: number) =>
  `${triggers === 0 ? "" : `Its ${triggers} ${triggers === 1 ? "trigger stops" : "triggers stop"}. `}Past runs stay in All runs.`;

const starterIcon = { person: "user", schedule: "calendar", responsive: "lightning" } as const;

const twoLine = css({
  display: "flex",
  flexDirection: "column",
  gap: "[2px]",
  paddingTop: "[0]",
});

const subLine = css({
  display: "flex",
  alignItems: "center",
  gap: "[4px]",
  textStyle: "xs",
  lineHeight: "[16px]",
  fontWeight: "normal",
  color: "neutral.fg.muted",
  whiteSpace: "nowrap",
});

/** The flows list: J0.1 with no flows (the DS EmptyState), J0.2 as a table. Its search stays as it was when you come back. */
export const Home = ({
  flows,
  search,
  onSearch,
  onOpen,
  onNew,
  onArchive,
  notice,
}: {
  /** A toast over the list, inside the shell so it gets the DS styles (`?confirm=undo`'s Archived · Undo). */
  notice?: React.ReactNode;
  flows: FlowListEntry[];
  search: string;
  onSearch: (search: string) => void;
  onOpen: (id: string) => void;
  onNew: () => void;
  /** A row's menu › Archive: the flow leaves the list. */
  onArchive?: (id: string) => void;
}) => {
  const confirmTake = useConfirmTake();
  // Menus and the Archive dialog portal in here, inside the shell's styles (as on the Triggers page).
  const portalRef = useRef<HTMLDivElement>(null);
  const [chips, setChips] = useState<RunFilterChip[]>(savedChips);
  const [savedToast, setSavedToast] = useState(false);
  const [sort, setSort] = useState<{ key: ListSortKey; flipped: boolean }>({
    key: "lastRun",
    flipped: false,
  });
  const [archiving, setArchiving] = useState<FlowListEntry | null>(null);
  const visible = flows.filter((flow) =>
    flow.document.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const matching = flows
    .map(rowFor)
    .filter((row) => row.name.toLowerCase().includes(search.trim().toLowerCase()))
    .filter((row) =>
      chips.every((chip) => {
        const value = chip.value;
        if (!value || value.value === null) {
          return true;
        }
        const hit = facetOf(row, chip.property) === value.value;
        return value.key === "isNot" ? !hit : hit;
      }),
    );
  const boardVisible = matching
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const order =
        sort.key === "name"
          ? left.row.name.localeCompare(right.row.name)
          : sort.key === "runs"
            ? (Number(right.row.runs) || 0) - (Number(left.row.runs) || 0)
            : whenMinutes(right.row.when) - whenMinutes(left.row.when);
      return (
        (sort.flipped ? -order : order) ||
        (sort.flipped ? right.index - left.index : left.index - right.index)
      );
    })
    .map(({ row }) => row);
  const applied = appliedChips(chips);
  const shownCount = oldList ? visible.length : flows.length;
  const rowChoices = flows.map(rowFor);
  const operatorsFor = (property: RunFilterChip["property"]) => {
    const unique = (values: (string | undefined)[]) => [
      ...new Set(values.filter((value): value is string => value !== undefined)),
    ];
    const choices =
      property === "web"
        ? unique(rowChoices.map((row) => row.web)).map((value) => ({ value, text: value }))
        : property === "version"
          ? unique(rowChoices.map((row) => row.version?.number)).map((value) => ({ value, text: value }))
          : unique(rowChoices.map(statusKindOf)).map((value) => ({
              value,
              text: statusKinds[value] ?? value,
            }));
    return [
      { key: "is" as const, label: "is", input: { type: "select" as const, items: choices } },
      { key: "isNot" as const, label: "is not", input: { type: "select" as const, items: choices } },
    ];
  };
  const sortItems = [
    {
      id: "sort-by",
      label: "Sort by",
      items: (Object.keys(listSorts) as ListSortKey[]).map((key) => ({
        id: `sort:${key}`,
        text: selectedLabel(listSorts[key].label, sort.key === key),
        selected: sort.key === key,
        selectedStyle: "highlight" as const,
        keepOpenOnSelect: true,
        onClick: () => setSort({ key, flipped: false }),
      })),
    },
    {
      id: "order",
      label: "Order",
      items: listSorts[sort.key].orders.map((text, index) => ({
        id: `order:${index}`,
        text: selectedLabel(text, sort.flipped === (index === 1)),
        selected: sort.flipped === (index === 1),
        selectedStyle: "highlight" as const,
        keepOpenOnSelect: true,
        onClick: () => setSort((current) => ({ ...current, flipped: index === 1 })),
      })),
    },
  ];
  const openRow = (id: string) => onOpen(id);
  const archiveRow = (id: string) => {
    const flow = flows.find((candidate) => candidate.id === id);
    if (!flow) {
      return;
    }
    if (confirmTake === "dialog") {
      setArchiving(flow);
    } else {
      onArchive?.(id);
    }
  };
  const newFlow = (
    <Button
      size="sm"
      variant="solid"
      tone="neutral"
      iconName="plus"
      onClick={onNew}
    >
      New flow
    </Button>
  );
  return (
    <HashShell>
      <PortalContainerContext value={portalRef}>
      <div ref={portalRef} className={css({ position: "relative" })}>
      <main
        className={css({
          display: "flex",
          flexDirection: "column",
          gap: "8",
          paddingTop: "12",
          paddingX: "12",
          paddingBottom: "12",
        })}
      >
        {/* The DS page header (h1 page title), with New flow on the right once a flow exists. */}
        <div className={css({ display: "flex", alignItems: "flex-start" })}>
          <div
            className={css({
              display: "flex",
              flexDirection: "column",
              gap: "[2px]",
              flex: "1",
            })}
          >
            <h1
              className={css({
                // The DS page header's h1 is 28/32, between the DS 2xl and 3xl text styles.
                fontSize: "[28px]", // token-guard: allow DS header h1 page title is 28 px
                lineHeight: "[32px]",
                fontWeight: "semibold",
                color: "neutral.fg.heading",
                margin: "[0]",
              })}
            >
              Flows
            </h1>
            <span
              className={css({
                textStyle: "sm",
                lineHeight: "[21px]",
                color: "neutral.fg.heading",
              })}
            >
              Processes that workers can monitor and manage
            </span>
          </div>
          {flows.length > 0 && oldList ? (
            <div
              className={css({
                display: "flex",
                alignItems: "center",
                gap: "2",
                marginTop: "1",
              })}
            >
              <div className={css({ width: "[200px]" })}>
                <TextInput
                  size="sm"
                  value={search}
                  placeholder="Search flows"
                  aria-label="Search flows"
                  prefix={{ iconName: "search", variant: "subtle" }}
                  onChange={(next) => onSearch(next)}
                />
              </div>
              {newFlow}
            </div>
          ) : null}
        </div>
        {!loadingOn && (flows.length === 0 || (oldList && shownCount === 0)) ? (
          // J0.1: the DS EmptyState in a bordered box.
          <div
            className={`${boxStyle} ${css({
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "4",
              paddingY: "[96px]",
              borderColor: "neutral.bd.subtle.hover",
            })}`}
          >
            <span
              className={css({
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "[48px]",
                height: "[48px]",
                borderRadius: "full",
                backgroundColor: "neutral.bgSolid.surface.active",
                borderWidth: "thin",
                borderStyle: "solid",
                borderColor: "neutral.bd.subtle",
                color: "neutral.fg.muted.hover",
              })}
            >
              <Zap size={20} strokeWidth={iconStroke} aria-hidden />
            </span>
            <div
              className={css({
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "1",
              })}
            >
              <span
                className={css({
                  textStyle: "base",
                  fontWeight: "semibold",
                  color: "neutral.fg.heading",
                })}
              >
                {flows.length === 0 ? "No flows yet" : "No flow matches"}
              </span>
              <span
                className={css({
                  textStyle: "sm",
                  color: "neutral.fg.muted",
                })}
              >
                {flows.length === 0
                  ? "A flow runs the same steps each time: by hand, on a schedule, or when data changes."
                  : `Nothing is called “${search}”.`}
              </span>
            </div>
            {flows.length === 0 ? newFlow : null}
          </div>
        ) : oldList ? (
          <div className={boxStyle}>
            <table className={tableStyle}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th className={css({ width: "[128px]" })}>Version</th>
                  <th className={css({ width: "[240px]" })}>Last run</th>
                  <th className={css({ width: "[96px]" })}>Runs</th>
                  <th className={css({ width: "[143px]" })}>Last edited</th>
                  <th
                    className={css({ width: "[56px]" })}
                    aria-label="Actions"
                  />
                </tr>
              </thead>
              <tbody>
                {visible.map((flow) => (
                  <tr
                    key={flow.id}
                    tabIndex={0}
                    data-flow-row={flow.id}
                    onClick={() => onOpen(flow.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        onOpen(flow.id);
                      }
                    }}
                  >
                    <td className={css({ color: "neutral.fg.heading" })}>
                      {flow.document.name}
                    </td>
                    <td className={css({ color: "neutral.fg.heading" })}>
                      {flow.version ? <VersionLabel {...flow.version} /> : null}
                    </td>
                    <td className={css({ color: "neutral.fg.heading" })}>
                      {flow.lastRun ? (
                        <span
                          className={css({
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "2",
                          })}
                        >
                          <RunGlyph
                            state={flow.lastRun.state}
                            progress={flow.lastRun.progress}
                            run
                          />
                          <RunIdsIn
                            text={
                              flow.lastRun.label === "Completed"
                                ? "Done"
                                : flow.lastRun.label
                            }
                          />
                        </span>
                      ) : (
                        <span
                          className={css({
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "2",
                            color: "neutral.fg.muted",
                          })}
                        >
                          <RunGlyph state="notReached" tooltip={false} />
                          No runs yet
                        </span>
                      )}
                    </td>
                    <td className={css({ color: "neutral.fg.heading" })}>
                      {flow.runCount
                        ? `${flow.runCount}`
                        : "–"}
                    </td>
                    <td className={css({ color: "neutral.fg.heading" })}>
                      {flow.lastEdited}
                    </td>
                    <td>
                      <Button
                        size="xs"
                        variant="ghost"
                        tone="neutral"
                        iconName="ellipsis"
                        aria-label={`More for ${flow.document.name}`}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            {/* The controls: the Triggers and Logs row (Sort, Filter, search, primary button at the right), the ribbon below. */}
            <div
              className={css({
                display: "flex",
                flexDirection: "column",
                gap: "4",
                marginBottom: "[-16px]",
              })}
            >
              <div
                className={css({
                  display: "flex",
                  alignItems: "center",
                  gap: "1",
                  paddingY: "1",
                })}
              >
                <span className={css({ flex: "1" })} />
                <Menu
                  position="bottom-end"
                  items={sortItems}
                  trigger={
                    <Button
                      size="sm"
                      variant="ghost"
                      tone="neutral"
                      iconName={sort.flipped ? "sortUp" : "sortDown"}
                      className={cx(rowButtonStyle, (sort.key !== "lastRun" || sort.flipped) && rowButtonActiveStyle)}
                      data-flows-sort
                    >
                      {sort.key !== "lastRun" || sort.flipped ? listSorts[sort.key].label : "Sort"}
                    </Button>
                  }
                />
                <FilterByMenu
                  only={listFilterProperties}
                  onPick={(property) => setChips(newChip(chips, property))}
                  trigger={
                    <Button
                      size="sm"
                      variant="ghost"
                      tone="neutral"
                      iconName="filter"
                      className={cx(rowButtonStyle, applied > 0 && rowButtonActiveStyle)}
                      data-flows-add-filter
                    >
                      {applied > 0 ? `Filter · ${applied}` : "Filter"}
                    </Button>
                  }
                />
                <span className={css({ width: "[200px]", marginLeft: "2" })}>
                  <TextInput
                    size="sm"
                    value={search}
                    placeholder="Search flows"
                    aria-label="Search flows"
                    prefix={{ iconName: "search", variant: "subtle" }}
                    onChange={(next) => onSearch(next)}
                  />
                </span>
                <span className={css({ marginLeft: "2" })}>
                  <Button
                    size="sm"
                    variant="subtle"
                    tone="neutral"
                    iconName="plus"
                    onClick={onNew}
                  >
                    New flow
                  </Button>
                </span>
              </div>
              {chips.length > 0 ? (
                <RunsFilterRibbon
                  chips={chips}
                  onChips={setChips}
                  runs={[]}
                  now={0}
                  only={listFilterProperties}
                  operatorsFor={operatorsFor}
                  onSave={() => {
                    savedChips = chips;
                    setSavedToast(true);
                  }}
                />
              ) : null}
            </div>
            <div className={boxStyle}>
              <Table className={flowsTableStyle} data-flows-table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th className={css({ width: "[96px]" })}>Web</th>
                    <th className={css({ width: "[128px]" })}>Version</th>
                    <th className={css({ width: "[168px]" })}>Status</th>
                    <th className={css({ width: "[196px]" })}>Last run</th>
                    <th className={css({ width: "[96px]" })}>Runs</th>
                    <th className={css({ width: "[143px]" })}>Last edited</th>
                    <th className={css({ width: "[56px]" })} aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {loadingOn
                    ? [0, 1, 2].map((row) => (
                        <tr key={row} data-loading-row>
                          {[78, 42, 28, 56, 70, 14, 50, 0].map((width, column) => (
                            // eslint-disable-next-line react/no-array-index-key -- fixed columns
                            <td key={column}>
                              {width > 0 ? <GreyBar width={width} /> : null}
                            </td>
                          ))}
                        </tr>
                      ))
                    : null}
                  {!loadingOn && boardVisible.length === 0 ? (
                    <tr data-flows-empty>
                      <td colSpan={8} className={css({ color: "neutral.fg.muted" })}>
                        No flows match
                      </td>
                    </tr>
                  ) : null}
                  {(loadingOn ? [] : boardVisible).map((row) => (
                    <tr
                      key={row.id}
                      tabIndex={0}
                      data-row
                      data-flow-row={row.id}
                      onClick={() => openRow(row.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          openRow(row.id);
                        }
                      }}
                    >
                      <td>{row.name}</td>
                      <td>{row.web}</td>
                      <td>{row.version ? <VersionLabel {...row.version} /> : null}</td>
                      <td>
                        {row.status ? (
                          <span
                            className={css({
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "2",
                            })}
                          >
                            <RunGlyph
                              state={row.status.state}
                              progress={row.status.progress}
                              run
                            />
                            {row.status.word}
                          </span>
                        ) : (
                          <span
                            className={css({
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "2",
                              color: "neutral.fg.muted",
                            })}
                          >
                            <RunGlyph state="notReached" tooltip={false} />
                            No runs yet
                          </span>
                        )}
                      </td>
                      <td>
                        {row.starter ? (
                          <div className={twoLine}>
                            <span>{row.when}</span>
                            <span className={subLine}>
                              <Icon name={starterIcon[row.starter.kind]} size="xs" />
                              {row.starter.text}
                            </span>
                          </div>
                        ) : null}
                      </td>
                      <td>{row.runs}</td>
                      <td>
                        <div className={twoLine}>
                          <span>{row.edited}</span>
                          <span className={subLine}>{row.editor}</span>
                        </div>
                      </td>
                      <td>
                        {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- keeps the menu's clicks off the row */}
                        <span onClick={(event) => event.stopPropagation()}>
                          <Menu
                            position="bottom-end"
                            className={css({ minWidth: "[160px]" })}
                            items={[
                              { id: "open", text: "Open", onClick: () => openRow(row.id) },
                              { id: "archive", text: "Archive", onClick: () => archiveRow(row.id) },
                            ]}
                            trigger={
                              <Button
                                size="xs"
                                variant="ghost"
                                tone="neutral"
                                iconName="ellipsis"
                                aria-label={`More for ${row.name}`}
                                data-row-menu
                              />
                            }
                          />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </>
        )}
      </main>
      {archiving ? (
        <ConfirmDialog
          title={`Archive ${archiving.document.name}?`}
          body={archiveBody(flowTriggersOf(archiving.document).items.length)}
          action="Archive"
          onClose={() => setArchiving(null)}
          onConfirm={() => {
            onArchive?.(archiving.id);
            setArchiving(null);
          }}
        />
      ) : null}
      {notice}
      {savedToast ? (
        <Toast text="Filters saved" onDone={() => setSavedToast(false)} />
      ) : null}
      </div>
      </PortalContainerContext>
    </HashShell>
  );
};
