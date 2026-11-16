import { useSyncExternalStore } from "react";

import { SegmentedControl } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { FocusRoot, FocusStack } from "../../worksheet/focus-stack";
import { ChangeList, type RecordedChange } from "./change-list";
import { Outline } from "./outline";

import type { PluginDocumentHandle } from "../../plugin";
import type { Expansion } from "./outline/rows";

/** How the changes show: each patch on two lines, or each change as the handle sent it. */
export type ChangesAs = "formatted" | "raw";

const noChanges = "Edit the net to see what each change does to the document.";

const changesAsItems: { value: ChangesAs; label: string }[] = [
  { value: "formatted", label: "Formatted" },
  { value: "raw", label: "Raw" },
];

/** Two panes that fill the tab and scroll each on its own. */
const panesStyle = css({
  display: "grid",
  gridTemplateColumns: "[minmax(0, 3fr) minmax(0, 2fr)]",
  gap: "6",
  height: "full",
});

const paneStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  minHeight: "[0]",
  overflowY: "auto",
});

const paneHeaderStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
  minHeight: "[24px]",
});

const paneTitleStyle = css({
  fontSize: "[11px]",
  fontWeight: "medium",
  textTransform: "uppercase",
  color: "neutral.s100",
});

/**
 * What the document's handle holds, beside the changes it has reported,
 * latest first. The arrows cross from one side to the other.
 */
export const DocumentView = ({
  handle,
  changes,
  changesAs,
  onChangesAs,
  expansion,
  onToggle,
}: {
  handle: PluginDocumentHandle;
  changes: readonly RecordedChange[];
  changesAs: ChangesAs;
  onChangesAs: (changesAs: ChangesAs) => void;
  /** Of both outlines: a path of the one is none of the other's. */
  expansion: Expansion;
  onToggle: (path: string) => void;
}) => {
  const document = useSyncExternalStore(handle.subscribe, handle.doc);

  return (
    <FocusRoot>
      <FocusStack axis="horizontal">
        <div className={panesStyle}>
          <section className={paneStyle}>
            <header className={paneHeaderStyle}>
              <h3 className={paneTitleStyle}>Document</h3>
            </header>
            <Outline
              label="Document"
              data={document}
              empty="The document is not ready."
              expansion={expansion}
              onToggle={onToggle}
            />
          </section>
          <section className={paneStyle}>
            <header className={paneHeaderStyle}>
              <h3 className={paneTitleStyle}>Changes, latest first</h3>
              <SegmentedControl
                aria-label="Show changes as"
                size="xxs"
                value={changesAs}
                items={changesAsItems}
                onChange={(value) => onChangesAs(value as ChangesAs)}
              />
            </header>
            {changesAs === "formatted" ? (
              <ChangeList changes={changes} empty={noChanges} />
            ) : (
              <Outline
                label="Changes"
                // What the handle sent, less the document it leaves, which
                // the other pane shows.
                data={changes.map(
                  ({ change: { next: _next, ...sent } }) => sent,
                )}
                // By its number, a change keeps its rows when a newer one
                // takes its place in the list.
                itemNames={changes.map(({ serial }) => String(serial))}
                empty={noChanges}
                // A change holds its patches a level down, so it opens a
                // level further than the document.
                expansion={{ ...expansion, depth: expansion.depth + 1 }}
                onToggle={onToggle}
              />
            )}
          </section>
        </div>
      </FocusStack>
    </FocusRoot>
  );
};
