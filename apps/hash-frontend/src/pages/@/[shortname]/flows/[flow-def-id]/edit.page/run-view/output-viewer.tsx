import { useEffect, useRef } from "react";

import { Button, LoadingSpinner } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { sidePanelFrame } from "../shared/side-panel-frame";
import { OutputSheet } from "./output-viewer/output-sheet";
import { getFileSteps, goByFileKey } from "./output-viewer/shared/files";
import {
  FileActions,
  FileNav,
  FileStage,
} from "./output-viewer/shared/output-file";
import { OutputList } from "./output-viewer/shared/output-list";
import {
  getEntityDisplay,
  isFileEntity,
  useRunEntities,
} from "./shared/run-entities";
import { countItems, getListLength } from "./shared/run-value-display";

import type { OutputViewerState } from "./shared/use-output-viewer";
import type { EntityId } from "@blockprotocol/type-system";

const noEntityIds: EntityId[] = [];

const column = css({
  display: "flex",
  flexDirection: "column",
  outline: "none",
});
const head = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  flexShrink: "0",
  height: "[52px]",
  px: "4",
  borderBottomWidth: "1px",
  borderBottomStyle: "solid",
  borderBottomColor: "bd.subtle",
});
const back = css({ ml: "-1.5" });
const headTitle = css({
  flex: "1",
  minWidth: "0",
  textStyle: "sm",
  fontWeight: "medium",
  color: "fg.heading",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});
const headActions = css({ display: "flex", alignItems: "center", gap: "1.5" });
const body = css({
  display: "flex",
  flexDirection: "column",
  flex: "1",
  gap: "6",
  minHeight: "0",
  p: "6",
  overflowY: "auto",
});
const heading = css({ display: "flex", flexDirection: "column", gap: "1" });
const headingTitle = css({
  textStyle: "sm",
  fontWeight: "medium",
  color: "fg.heading",
  overflowWrap: "anywhere",
});
const headingMeta = css({ textStyle: "xs", color: "fg.subtle" });
/* The file full height, less the run's header and the file's name above it, and edge to edge of the panel. */
const stage = css({ minHeight: "[calc(100vh - 220px)]", mx: "-6" });
const actions = css({ display: "flex", flexWrap: "wrap", gap: "1.5" });
const loading = css({ display: "flex", justifyContent: "center", py: "6" });

/** A value a run got or gave, open in place of the right panel, and wide in a side sheet once expanded. */
export const OutputViewer = ({ viewer }: { viewer: OutputViewerState }) => {
  const { view, depth, wide } = viewer;
  const entities = useRunEntities(
    !view
      ? noEntityIds
      : view.kind === "file"
        ? view.entityIds
        : view.list.kind === "entities"
          ? view.list.entityIds
          : noEntityIds,
  );
  const columnRef = useRef<HTMLElement>(null);

  /* Takes Esc and ← → from the start, and again on going back from a file to its list and on collapsing. */
  useEffect(() => {
    if (depth > 0 && !wide) {
      columnRef.current?.focus({ preventScroll: true });
    }
  }, [depth, wide]);

  if (!view) {
    return null;
  }

  const file = view.kind === "file" ? entities.entities[view.index] : undefined;
  const fileSteps =
    view.kind === "file"
      ? getFileSteps(entities.entities.map(isFileEntity), view.index)
      : null;
  const goToFile = (index: number) => {
    if (view.kind === "file") {
      viewer.replace({ ...view, index });
    }
  };
  const openFile = (index: number) => {
    if (view.kind === "list" && view.list.kind === "entities") {
      viewer.push({
        kind: "file",
        entityIds: view.list.entityIds,
        index,
        title: view.title,
        source: view.source,
      });
    }
  };
  const pickType = (typeKey: string) => {
    if (view.kind === "list") {
      viewer.replace({ ...view, typeKey });
    }
  };
  const fileHeading = file
    ? getEntityDisplay(file, entities.typesMap, entities)
    : null;

  return (
    <>
      {/* Esc and ← → anywhere in the viewer, which isn't a control of its own. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <section
        ref={columnRef}
        tabIndex={-1}
        aria-label={view.title}
        /* Under the side sheet, which isn't modal, it would stay in the tab order and be read twice. */
        inert={wide}
        className={cx(sidePanelFrame, column)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            viewer.back();
          } else if (fileSteps) {
            goByFileKey(event, fileSteps, goToFile);
          }
        }}
      >
        <div className={head}>
          <Button
            size="sm"
            variant="ghost"
            tone="neutral"
            iconName="arrowLeft"
            aria-label="Back"
            tooltip={depth > 1 ? "Back to the list · Esc" : "Back · Esc"}
            className={back}
            onClick={viewer.back}
          />
          <span className={headTitle}>{view.source}</span>
          <span className={headActions}>
            {fileSteps && (
              <FileNav steps={fileSteps} variant="ghost" onGo={goToFile} />
            )}
            <Button
              size="sm"
              variant="ghost"
              tone="neutral"
              iconName="expand"
              aria-label="Expand"
              tooltip="Open wide, beside the run"
              onClick={viewer.expand}
            />
          </span>
        </div>
        <div
          // A new view starts at its top, not where the last was scrolled to.
          key={`${depth}.${view.kind === "file" ? view.index : ""}`}
          className={body}
        >
          {view.kind === "list" ? (
            <>
              <div className={heading}>
                <span className={headingTitle}>{view.title}</span>
                <span className={headingMeta}>
                  {countItems(getListLength(view.list))}
                </span>
              </div>
              <OutputList
                list={view.list}
                entities={entities}
                typeKey={view.typeKey}
                onPickType={pickType}
                onOpenFile={openFile}
                onShowAll={viewer.expand}
              />
            </>
          ) : file ? (
            <>
              <div className={heading}>
                <span className={headingTitle}>{fileHeading?.title}</span>
                <span className={headingMeta}>{fileHeading?.meta}</span>
              </div>
              <FileStage file={file} wide={false} className={stage} />
              <div className={actions}>
                <FileActions file={file} compact={false} />
              </div>
            </>
          ) : entities.loading ? (
            <div role="status" className={loading}>
              <LoadingSpinner size="md" />
            </div>
          ) : (
            <div className={heading}>
              <span className={headingTitle}>
                {getEntityDisplay(undefined, undefined, entities).title}
              </span>
            </div>
          )}
        </div>
      </section>
      {wide && (
        <OutputSheet
          view={view}
          entities={entities}
          file={file}
          fileSteps={fileSteps}
          onGoToFile={goToFile}
          onPickType={pickType}
          onOpenFile={openFile}
          onCollapse={viewer.collapse}
        />
      )}
    </>
  );
};
