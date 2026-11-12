import { useEffect, useRef } from "react";

import { Button, Drawer } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { getEntityDisplay } from "../shared/run-entities";
import { goByFileKey } from "./shared/files";
import { FileActions, FileNav, FileStage } from "./shared/output-file";
import { OutputList } from "./shared/output-list";

import type { RunEntities } from "../shared/run-entities";
import type { OutputView } from "../shared/use-output-viewer";
import type { FileSteps } from "./shared/files";
import type { HashEntity } from "@local/hash-graph-sdk/entity";

const actions = css({ display: "flex", alignItems: "center", gap: "1.5" });
/* A file fills the body, which has no padding then. */
const content = css({
  display: "flex",
  flexDirection: "column",
  minHeight: "full",
  outline: "none",
});
const stage = css({ flex: "1" });

/**
 * A value open wide, beside the run. It doesn't block the page, so the canvas and the run stay in view and live. It's a
 * layer over the value open in the panel: Esc and Collapse go back to that.
 */
export const OutputSheet = ({
  view,
  entities,
  file,
  fileSteps,
  onGoToFile,
  onPickType,
  onOpenFile,
  onCollapse,
}: {
  view: OutputView;
  entities: RunEntities;
  /** The file open, once it's loaded and found. */
  file: HashEntity | undefined;
  fileSteps: FileSteps | null;
  onGoToFile: (index: number) => void;
  onPickType: (typeKey: string) => void;
  onOpenFile: (index: number) => void;
  onCollapse: () => void;
}) => {
  /* Also says when the file is loading, or couldn't be loaded or found. */
  const fileHeading =
    view.kind === "file"
      ? getEntityDisplay(file, entities.typesMap, entities)
      : null;
  /* Takes Esc and ← → from the start, on what it shows rather than a button, whose tooltip would take the first Esc. */
  const contentRef = useRef<HTMLDivElement>(null);

  /* And again once a file opens from the list, whose row had them. */
  useEffect(() => {
    contentRef.current?.focus({ preventScroll: true });
  }, [view.kind]);

  return (
    <Drawer
      // `outputSheetWidth` wide.
      size="md"
      position="right"
      variant="plain"
      showBackdrop={false}
      shouldCloseOn="none"
      loading={view.kind === "file" && !file && entities.loading}
      initialFocusRef={contentRef}
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
        title={fileHeading?.title ?? view.title}
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
      <Drawer.Body withPadding={view.kind === "list"}>
        <div ref={contentRef} tabIndex={-1} className={content}>
          {view.kind === "list" ? (
            <OutputList
              list={view.list}
              entities={entities}
              typeKey={view.typeKey}
              onPickType={onPickType}
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
