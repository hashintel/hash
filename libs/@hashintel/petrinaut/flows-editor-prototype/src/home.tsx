import { Button, Icon, TextInput } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { HashShell } from "./hash-shell";
import { RunGlyph } from "./run-glyph";
import { RunIdsIn } from "./run-id";
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
  notice,
}: {
  /** A toast over the list, inside the shell so it gets the DS styles (`?confirm=undo`'s Archived · Undo). */
  notice?: React.ReactNode;
  flows: FlowListEntry[];
  search: string;
  onSearch: (search: string) => void;
  onOpen: (id: string) => void;
  onNew: () => void;
}) => {
  const visible = flows.filter((flow) =>
    flow.document.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const boardVisible = boardRows.filter((row) =>
    row.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const shownCount = oldList
    ? visible.length
    : flows.length === 0
      ? 0
      : boardVisible.length;
  const openBoardRow = (name: string, index: number) => {
    const flow =
      flows.find((candidate) => candidate.document.name === name) ??
      flows[index] ??
      flows[0];
    if (flow) {
      onOpen(flow.id);
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
          {flows.length > 0 ? (
            <div
              className={css({
                display: "flex",
                alignItems: "center",
                gap: "2",
                marginTop: "1",
              })}
            >
              <div className={css({ width: "[240px]" })}>
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
        {shownCount === 0 ? (
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
              <Icon name="infinity" size="md" />
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
            {/* The ribbon (F9-RIBBON): Add filter and the Last run sort are buttons only for now, not wired. */}
            <div
              className={css({
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "[-8px]",
              })}
            >
              <Button size="sm" variant="ghost" tone="neutral" iconName="plus">
                Add filter
              </Button>
              <Button
                size="sm"
                variant="subtle"
                tone="neutral"
                iconName="sortDown"
                suffix={<Icon name="chevronDown" size="sm" />}
              >
                Last run
              </Button>
            </div>
            <div className={boxStyle}>
              <table className={tableStyle}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th className={css({ width: "[96px]" })}>Web</th>
                    <th className={css({ width: "[128px]" })}>Version</th>
                    <th className={css({ width: "[168px]" })}>Status</th>
                    <th className={css({ width: "[196px]" })}>Last run</th>
                    <th className={css({ width: "[96px]" })}>Runs</th>
                    <th className={css({ width: "[143px]" })}>Last edited</th>
                    <th
                      className={css({ width: "[56px]" })}
                      aria-label="Actions"
                    />
                  </tr>
                </thead>
                <tbody>
                  {boardVisible.map((row, index) => (
                    <tr
                      key={row.name}
                      tabIndex={0}
                      onClick={() => openBoardRow(row.name, index)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          openBoardRow(row.name, index);
                        }
                      }}
                    >
                      <td className={css({ color: "neutral.fg.heading" })}>
                        {row.name}
                      </td>
                      <td className={css({ color: "neutral.fg.heading" })}>
                        {row.web}
                      </td>
                      <td className={css({ color: "neutral.fg.heading" })}>
                        <VersionLabel {...row.version} />
                      </td>
                      <td className={css({ color: "neutral.fg.heading" })}>
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
                      <td className={css({ color: "neutral.fg.heading" })}>
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
                      <td className={css({ color: "neutral.fg.heading" })}>
                        {row.runs}
                      </td>
                      <td className={css({ color: "neutral.fg.heading" })}>
                        <div className={twoLine}>
                          <span>{row.edited}</span>
                          <span className={subLine}>{row.editor}</span>
                        </div>
                      </td>
                      <td>
                        <Button
                          size="xs"
                          variant="ghost"
                          tone="neutral"
                          iconName="ellipsis"
                          aria-label={`More for ${row.name}`}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
      {notice}
    </HashShell>
  );
};
