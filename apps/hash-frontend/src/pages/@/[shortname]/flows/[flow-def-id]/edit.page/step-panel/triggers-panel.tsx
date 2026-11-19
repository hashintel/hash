import { useState } from "react";

import {
  Button,
  Drawer,
  Icon,
  SegmentedControl,
  TextInput,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { ShowAllButton } from "../run-view/shared/show-all-button";
import { filterTriggerRows } from "../shared/flow-triggers";

import type {
  FlowSchedules,
  TriggerRow,
  TriggerState,
} from "../shared/flow-triggers";

/** How many of a kind's triggers the panel lists, unless searching, before "Show all N". */
const shownPerKind = 4;

const block = css({ display: "flex", flexDirection: "column" });
const manualRow = css({ display: "flex", alignItems: "center", gap: "3" });
const manualText = css({
  display: "flex",
  flexDirection: "column",
  flex: "1",
  gap: "0.5",
});
const triggersRow = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
  minHeight: "8",
});
const searchField = css({ flex: "1" });
const heading = css({ textStyle: "sm", color: "fg.heading" });
const muted = css({ textStyle: "sm", color: "fg.muted" });
const groupLabel = css({ textStyle: "sm", color: "fg.muted", py: "2" });
const row = css({
  display: "flex",
  alignItems: "center",
  gap: "3",
  minHeight: "10",
  textStyle: "sm",
  color: "fg.heading",
});
const rowIcon = css({ display: "flex", color: "fg.muted" });
const rowText = css({ flex: "1", minWidth: "0", truncate: true });

const TriggerRows = ({ rows }: { rows: TriggerRow[] }) =>
  rows.map(({ entityId, text, on }) => (
    <div key={entityId} className={row}>
      <span className={rowIcon}>
        <Icon name="calendarClock" size="sm" />
      </span>
      <span className={rowText}>{text}</span>
      <span className={muted}>{on ? "On" : "Paused"}</span>
    </div>
  ));

/**
 * What can start the flow, read-only: manual runs, then its schedules, which can be filtered by state and searched.
 * A kind with more triggers than fit lists them all in a sheet beside the panel.
 */
export const TriggersPanelBody = ({
  schedules,
}: {
  schedules: FlowSchedules;
}) => {
  const [state, setState] = useState<TriggerState>("all");
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);

  const shown = filterTriggerRows(
    (Array.isArray(schedules) ? schedules : []).toSorted((left, right) =>
      left.text.localeCompare(right.text),
    ),
    { state, search },
  );
  const searchTerm = search.trim();
  const groupTitle = `Schedules · ${shown.length}`;

  return (
    <>
      <div className={manualRow}>
        <div className={manualText}>
          <span className={heading}>Manual runs</span>
          <span className={muted}>Show a Run button on this flow</span>
        </div>
        <span className={muted}>On</span>
      </div>
      <div className={block}>
        <div className={triggersRow}>
          {searching ? (
            <>
              <TextInput
                size="sm"
                className={searchField}
                value={search}
                onChange={setSearch}
                placeholder="Search triggers"
                prefix={{ iconName: "search", variant: "subtle" }}
                aria-label="Search triggers"
                autoFocus
              />
              {searchTerm !== "" && (
                <span className={muted}>
                  {shown.length} {shown.length === 1 ? "match" : "matches"}
                </span>
              )}
              <Button
                size="xs"
                variant="ghost"
                tone="neutral"
                iconName="close"
                aria-label="Stop searching"
                onClick={() => {
                  setSearching(false);
                  setSearch("");
                }}
              />
            </>
          ) : (
            <>
              <SegmentedControl<TriggerState>
                size="sm"
                aria-label="Show triggers"
                items={[
                  { value: "all", label: "All" },
                  { value: "on", label: "On" },
                  { value: "paused", label: "Paused" },
                ]}
                value={state}
                onChange={setState}
              />
              <Button
                size="xs"
                variant="ghost"
                tone="neutral"
                iconName="search"
                aria-label="Search triggers"
                onClick={() => setSearching(true)}
              />
            </>
          )}
        </div>
        {schedules === "loading" ? (
          <span className={groupLabel}>Loading schedules…</span>
        ) : schedules === "unavailable" ? (
          <span className={groupLabel}>Couldn't load the schedules</span>
        ) : shown.length === 0 ? (
          <span className={groupLabel}>
            {schedules.length === 0 ? "No schedules" : "No triggers match"}
          </span>
        ) : (
          <>
            <span className={groupLabel}>{groupTitle}</span>
            <TriggerRows
              rows={searchTerm === "" ? shown.slice(0, shownPerKind) : shown}
            />
            {searchTerm === "" && shown.length > shownPerKind && (
              <ShowAllButton
                count={shown.length}
                noun="schedules"
                onClick={() => setSheetOpen(true)}
              />
            )}
          </>
        )}
      </div>
      {sheetOpen && (
        <Drawer
          // 640px wide, as the run view's output sheet.
          size="md"
          position="right"
          variant="plain"
          showBackdrop={false}
          shouldCloseOn="none"
          aria-label={groupTitle}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setSheetOpen(false);
            }
          }}
        >
          <Drawer.Header
            title={groupTitle}
            actions={
              <Button
                size="sm"
                variant="subtle"
                tone="neutral"
                iconName="collapse"
                aria-label="Back to the panel"
                tooltip="Back to the panel · Esc"
                onClick={() => setSheetOpen(false)}
              />
            }
          />
          <Drawer.Body>
            <div className={block}>
              <TriggerRows rows={shown} />
            </div>
          </Drawer.Body>
        </Drawer>
      )}
    </>
  );
};
