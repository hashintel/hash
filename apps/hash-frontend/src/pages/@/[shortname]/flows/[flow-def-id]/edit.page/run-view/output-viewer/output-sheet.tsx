import { useRef } from "react";

import { Button, Drawer } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { getEntityDisplay } from "../shared/run-entities";
import { goByFileKey } from "./shared/files";
import { FileActions, FileNav, FileStage } from "./shared/output-file";
import { OutputList } from "./shared/output-list";

import type { RunEntities } from "../shared/run-entities";
import type { OutputView } from "../use-output-viewer";
import type { FileSteps } from "./shared/files";
import type { HashEntity } from "@local/hash-graph-sdk/entity";

const actions = css({ display: "flex", alignItems: "center", gap: "1.5" });
/* The file filling the sheet under its header, past the body's padding. */
const stage = css({ position: "absolute", inset: "0", overflowY: "auto" });
const focusTarget = css({ outline: "none" });

/**
 * A value open wide, in a side sheet beside the run. It doesn't block the page, so the canvas and the run stay in view
 * and live. It's a layer over the value open in the panel: Esc and collapse go back to that.
 */
export const OutputSheet = ({
  view,
  entities,
  file,
  fileSteps,
  onGoToFile,
  onOpenFile,
  onCollapse,
}: {
  view: OutputView;
  entities: RunEntities;
  /** The file open, once it's loaded. */
  file: HashEntity | null;
  fileSteps: FileSteps | null;
  onGoToFile: (index: number) => void;
  onOpenFile: (index: number) => void;
  onCollapse: () => void;
}) => {
  const fileHeading = file
    ? getEntityDisplay(file, entities.typesMap, entities)
    : null;
  const title = fileHeading?.title ?? view.title;
  /* Takes Esc and ← → from the start, on what it shows rather than a button, whose tooltip would take the first Esc. */
  const bodyRef = useRef<HTMLDivElement>(null);

  return (
    <Drawer
      // `outputSheetWidth` wide.
      size="md"
      position="right"
      variant="plain"
      showBackdrop={false}
      shouldCloseOn="none"
      initialFocusRef={bodyRef}
      aria-label={title}
      onClose={onCollapse}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onCollapse();
        } else if (fileSteps) {
          goByFileKey(event, fileSteps, onGoToFile);
        }
      }}
    >
      <Drawer.Header
        title={title}
        description={[fileHeading?.meta, view.source]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <span className={actions}>
            {fileSteps && (
              <FileNav steps={fileSteps} variant="subtle" onGo={onGoToFile} />
            )}
            {file && <FileActions file={file} compact />}
            <Button
              size="sm"
              variant="subtle"
              tone="neutral"
              iconName="collapse"
              aria-label="Collapse"
              tooltip="Back to the panel · Esc"
              onClick={onCollapse}
            />
          </span>
        }
      />
      <Drawer.Body>
        <div ref={bodyRef} tabIndex={-1} className={focusTarget}>
          {view.kind === "list" ? (
            <OutputList
              list={view.list}
              entities={entities}
              onOpenFile={onOpenFile}
            />
          ) : file ? (
            <FileStage file={file} wide className={stage} />
          ) : null}
        </div>
      </Drawer.Body>
    </Drawer>
  );
};
