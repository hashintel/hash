import { Button, Icon, TextInput } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { HashShell } from "./hash-shell";
import { RunGlyph } from "./run-glyph";
import { RunIdsIn } from "./run-id";

import type { EditorDocument } from "./document";
import type { ItemProgress, StepState } from "./run-history";

export type FlowListEntry = {
  id: string;
  document: EditorDocument;
  /** J0.2's "Last edited" column. */
  lastEdited: string;
  /** "v6 · Draft" or "v5 · Live" (V0–V7). */
  version?: string;
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
    color: "neutral.fg.muted.hover",
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

/** The flows list: J0.1 with no flows (the DS EmptyState), J0.2 as a table. Its search stays as it was when you come back. */
export const Home = ({
  flows,
  search,
  onSearch,
  onOpen,
  onNew,
}: {
  flows: FlowListEntry[];
  search: string;
  onSearch: (search: string) => void;
  onOpen: (id: string) => void;
  onNew: () => void;
}) => {
  const visible = flows.filter((flow) =>
    flow.document.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
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
                color: "neutral.fg.muted.hover",
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
        {visible.length === 0 ? (
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
                  color: "neutral.fg.muted.disabled",
                })}
              >
                {flows.length === 0
                  ? "A flow runs the same steps each time: by hand, on a schedule, or when data changes."
                  : `Nothing is called “${search}”.`}
              </span>
            </div>
            {flows.length === 0 ? newFlow : null}
          </div>
        ) : (
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
                    <td className={css({ color: "neutral.fg.muted.hover" })}>
                      {flow.version ?? ""}
                    </td>
                    <td className={css({ color: "neutral.fg.muted.hover" })}>
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
                          />
                          <RunIdsIn text={flow.lastRun.label} />
                        </span>
                      ) : (
                        <span className={css({ color: "neutral.fg.subtle" })}>
                          No runs yet
                        </span>
                      )}
                    </td>
                    <td className={css({ color: "neutral.fg.muted.hover" })}>
                      {flow.runCount
                        ? `${flow.runCount} ${flow.runCount === 1 ? "run" : "runs"}`
                        : "–"}
                    </td>
                    <td className={css({ color: "neutral.fg.muted.hover" })}>
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
        )}
      </main>
    </HashShell>
  );
};
