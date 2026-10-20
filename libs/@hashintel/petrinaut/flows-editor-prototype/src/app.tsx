import { ReactFlowProvider } from "@xyflow/react";
import { useRef, useState } from "react";

import {
  Button,
  PortalContainerContext,
  Tooltip,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { AddNodePicker } from "./add-node-picker";
import { FlowCanvas } from "./canvas";
import { EditorContext, type EditorUi } from "./editor-context";
import { PropertiesPanel } from "./properties-panel";
import { RunDialog, triggerSummary, TriggersDialog } from "./run-dialogs";
import { validateDocument } from "./shapes";
import { screenStates } from "./states";

import type { EditorDocument } from "./document";

const rootStyle = css({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  height: "[100vh]",
  width: "[100vw]",
  backgroundColor: "neutral.s10",
  fontFamily: "body",
  color: "neutral.s120",
});

const topBarStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "3",
  height: "[52px]",
  paddingX: "3",
  backgroundColor: "neutral.s00",
  borderBottomWidth: "thin",
  borderBottomStyle: "solid",
  borderBottomColor: "neutral.s40",
  flexShrink: 0,
});

const titleInputStyle = css({
  fontSize: "sm",
  fontWeight: "semibold",
  color: "neutral.s120",
  backgroundColor: "[transparent]",
  borderWidth: "[0]",
  borderRadius: "sm",
  paddingX: "1",
  height: "[28px]",
  width: "[280px]",
  _hover: { backgroundColor: "neutral.s15" },
  _focus: {
    outline: "[2px solid var(--colors-blue-s90)]",
    backgroundColor: "neutral.s00",
  },
});

const bottomBarStyle = css({
  position: "absolute",
  bottom: "[24px]",
  left: "[50%]",
  transform: "[translateX(-50%)]",
  display: "flex",
  alignItems: "center",
  gap: "1",
  padding: "1",
  backgroundColor: "white.a95",
  borderWidth: "thin",
  borderColor: "neutral.a50",
  borderStyle: "solid",
  borderRadius: "[8px]",
  backdropFilter: "[blur(3px)]",
  boxShadow: "[0 3px 11px rgba(0, 0, 0, 0.1)]",
  zIndex: "[4]",
});

const dividerStyle = css({
  width: "[1px]",
  height: "[20px]",
  backgroundColor: "neutral.s40",
  marginX: "1",
});

export const Editor = ({
  initialDocument,
  initialUi,
}: {
  initialDocument: EditorDocument;
  initialUi: EditorUi;
}) => {
  const [document, setDocumentState] = useState(initialDocument);
  const [ui, setUiState] = useState(initialUi);
  const portalRef = useRef<HTMLDivElement>(null);
  const addNodeRef = useRef<HTMLButtonElement>(null);
  const canvasControls = useRef<{
    fitView: () => void;
    zoom: (by: number) => void;
  } | null>(null);

  const validation = validateDocument(document);
  const errorCount =
    validation.flowLevel.filter((diagnostic) => diagnostic.severity === "error")
      .length +
    [...validation.byStep.values()]
      .flat()
      .filter((diagnostic) => diagnostic.severity === "error").length +
    validation.incomplete.size;
  const mockCount = validation.mockFields.size;
  const allMessages = [
    ...validation.flowLevel.map((diagnostic) => diagnostic.message),
    ...[...validation.byStep.values()]
      .flat()
      .map((diagnostic) => diagnostic.message),
  ];

  const context = {
    document,
    setDocument: (update: (current: EditorDocument) => EditorDocument) =>
      setDocumentState(update),
    ui,
    setUi: (update: (current: EditorUi) => EditorUi) => setUiState(update),
    validation,
  };

  return (
    <PortalContainerContext value={portalRef}>
      <EditorContext value={context}>
        <div ref={portalRef} className={`${rootStyle} petrinaut-root`}>
          <header className={topBarStyle}>
            <Button
              size="sm"
              variant="ghost"
              iconName="arrowLeft"
              aria-label="Back"
              tooltip="Back"
              disabled
            />
            <input
              className={titleInputStyle}
              value={document.name}
              aria-label="Flow name"
              onChange={(event) => {
                const name = event.target.value;
                setDocumentState((current) => ({ ...current, name }));
              }}
            />
            <div
              className={css({
                marginLeft: "auto",
                display: "flex",
                alignItems: "center",
                gap: "2",
              })}
            >
              <Tooltip
                content={
                  errorCount > 0
                    ? allMessages.slice(0, 6).join(" · ") ||
                      "Some steps are not set up yet"
                    : mockCount > 0
                      ? `The engine's validator finds no errors, but ${mockCount} fields hold values it can't represent yet (text mixed with values, lists of several sources).`
                      : "The engine's validator finds no errors"
                }
              >
                <span
                  className={css({
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "1",
                    fontSize: "xs",
                    color: errorCount === 0 ? "neutral.s100" : "red.s100",
                  })}
                >
                  <span
                    className={css({
                      width: "[8px]",
                      height: "[8px]",
                      borderRadius: "full",
                      backgroundColor:
                        errorCount === 0 ? "green.s90" : "red.s90",
                    })}
                  />
                  {errorCount > 0
                    ? `${errorCount} to fix`
                    : mockCount > 0
                      ? `Ready · ${mockCount} mock`
                      : "Ready"}
                </span>
              </Tooltip>
              <Button
                size="sm"
                variant="subtle"
                iconName="calendarClock"
                tooltip={triggerSummary(document)}
                onClick={() =>
                  setUiState((current) => ({ ...current, triggersOpen: true }))
                }
              >
                Triggers
              </Button>
              <Button
                size="sm"
                variant="solid"
                iconName="play"
                onClick={() =>
                  setUiState((current) => ({ ...current, runOpen: true }))
                }
              >
                Run
              </Button>
            </div>
          </header>
          <main
            className={css({
              position: "relative",
              flex: "1",
              minHeight: "[0]",
            })}
          >
            <ReactFlowProvider>
              <FlowCanvas
                onInit={(fitView, zoom) => {
                  canvasControls.current = { fitView, zoom };
                }}
              />
            </ReactFlowProvider>
            <PropertiesPanel />
            <div
              className={bottomBarStyle}
              role="toolbar"
              aria-label="Canvas tools"
            >
              <Button
                ref={addNodeRef}
                size="sm"
                variant="solid"
                iconName="plus"
                onClick={() =>
                  setUiState((current) => ({
                    ...current,
                    picker: current.picker ? null : { anchor: "toolbar" },
                  }))
                }
              >
                Add node
              </Button>
              <span className={dividerStyle} />
              <Button
                size="sm"
                variant="ghost"
                iconName="zoomOut"
                aria-label="Zoom out"
                tooltip="Zoom out"
                onClick={() => canvasControls.current?.zoom(1 / 1.2)}
              />
              <Button
                size="sm"
                variant="ghost"
                iconName="zoomIn"
                aria-label="Zoom in"
                tooltip="Zoom in"
                onClick={() => canvasControls.current?.zoom(1.2)}
              />
              <Button
                size="sm"
                variant="ghost"
                iconName="expand"
                aria-label="Fit to screen"
                tooltip="Fit to screen"
                onClick={() => canvasControls.current?.fitView()}
              />
            </div>
            <AddNodePicker toolbarAnchor={addNodeRef} />
          </main>
          {ui.runOpen ? <RunDialog /> : null}
          {ui.triggersOpen ? <TriggersDialog /> : null}
        </div>
      </EditorContext>
    </PortalContainerContext>
  );
};

const screensStyle = css({
  minHeight: "[100vh]",
  backgroundColor: "neutral.s15",
  padding: "8",
  fontFamily: "body",
  color: "neutral.s120",
});

/**
 * Every screen side by side, in labelled rows of two, each a live copy of the editor in its starting state.
 */
export const Screens = () => {
  const rows = [...new Set(screenStates.map((state) => state.row))];
  const base = `${globalThis.location.pathname}`;
  return (
    <div className={`${screensStyle} petrinaut-root`}>
      <h1
        className={css({
          fontSize: "xl",
          fontWeight: "semibold",
          marginBottom: "1",
        })}
      >
        Flows editor prototype · screens
      </h1>
      <p
        className={css({
          fontSize: "sm",
          color: "neutral.s100",
          marginBottom: "6",
        })}
      >
        Each frame is the live editor. Open one to click through it.
      </p>
      {rows.map((row) => (
        <section key={row} className={css({ marginBottom: "8" })}>
          <h2
            className={css({
              fontSize: "sm",
              fontWeight: "semibold",
              textTransform: "uppercase",
              letterSpacing: "[0.04em]",
              color: "neutral.s90",
              marginBottom: "3",
            })}
          >
            {row}
          </h2>
          <div
            className={css({
              display: "grid",
              gridTemplateColumns: "[repeat(2, minmax(0, 1fr))]",
              gap: "6",
            })}
          >
            {screenStates
              .filter((state) => state.row === row)
              .map((state) => (
                <figure key={state.id} className={css({ margin: "[0]" })}>
                  <div
                    className={css({
                      position: "relative",
                      width: "[100%]",
                      aspectRatio: "[1440 / 900]",
                      overflow: "hidden",
                      borderRadius: "lg",
                      borderWidth: "thin",
                      borderStyle: "solid",
                      borderColor: "neutral.s40",
                      backgroundColor: "neutral.s00",
                    })}
                  >
                    <iframe
                      title={state.title}
                      src={`${base}?state=${state.id}`}
                      loading="lazy"
                      className={css({
                        position: "absolute",
                        top: "[0]",
                        left: "[0]",
                        width: "[1440px]",
                        height: "[900px]",
                        border: "[0]",
                        transformOrigin: "[0 0]",
                      })}
                      style={{ transform: "scale(var(--frame-scale, 0.45))" }}
                    />
                  </div>
                  <figcaption
                    className={css({
                      display: "flex",
                      alignItems: "baseline",
                      gap: "2",
                      marginTop: "2",
                    })}
                  >
                    <a
                      href={`${base}?state=${state.id}`}
                      className={css({
                        fontSize: "sm",
                        fontWeight: "semibold",
                        color: "blue.s100",
                      })}
                    >
                      {state.title}
                    </a>
                    <span
                      className={css({ fontSize: "sm", color: "neutral.s100" })}
                    >
                      {state.caption}
                    </span>
                  </figcaption>
                </figure>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
};
