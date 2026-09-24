import { Suspense, use, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";
import { compileReactiveModuleExport } from "@hashintel/petrinaut-core/reactive-modules";

import { LanguageClientContext } from "../../../../react/lsp/context";
import { SimulationContext } from "../../../../react/simulation/context";
import { SDCPNContext } from "../../../../react/state/sdcpn-context";
import { HorizontalTabsHeader } from "../../../components/sub-view/horizontal/horizontal-tabs-container";
import { ExperimentalIcon } from "../../../experimental-icons";
import { CodeEditor } from "../../../monaco/code-editor";
import { ResizeHandle } from "../../../resize/resize-handle";
import { FloatingResizeHandles } from "../shared/floating-resize-handles";
import { useSideDockContainer } from "../shared/side-dock";
import { useFloatingPanel } from "../shared/use-floating-panel";
import { loadExportLanguages } from "./reactive-modules-panel/monaco-languages";
import { useLambdaHir } from "./reactive-modules-panel/use-lambda-hir";

import type { HorizontalTabView } from "../../../components/sub-view/horizontal/horizontal-tabs-container";
import type { CodeEditorProps } from "../../../monaco/code-editor";
import type { PetriNetIrDiagnostic } from "@hashintel/petrinaut-core/reactive-modules";

const PANEL_LABEL = "Zeroth Reactive Modules";

/** A movable window over the workspace, or a column beside it. */
export type ReactiveModulesPanelPlacement = "docked" | "floating";

/** Width bounds in CSS pixels. */
const PANEL_LIMITS = { minWidth: 360, maxWidth: 1200 };

// The AI assistant's docked cap. A wider column docked beside the assistant
// leaves the workspace, which is the only row item that gives way, no room.
const DOCKED_MAX_WIDTH = 720;

type TabId = "ir";

const TABS: (HorizontalTabView & { id: TabId })[] = [
  { id: "ir", title: "Petri Net IR" },
];

/**
 * One Monaco model per tab, so each keeps its own scroll position and
 * collapsed regions while another is shown. The scheme keeps them apart from
 * the language server's documents.
 */
const TAB_MODELS: Record<TabId, { language: string; path: string }> = {
  ir: {
    language: "yaml",
    path: "petrinaut-reactive-modules://export/net.pn.yaml",
  },
};

// Monaco consumes every wheel event over the editor, its default: an event
// let through at the end of the text would scroll the page behind the panel,
// and a horizontal one reaching the page edge would navigate the browser
// back or forward.
const VIEWER_OPTIONS: CodeEditorProps["options"] = {
  readOnly: true,
  domReadOnly: true,
  lineNumbers: "on",
  renderLineHighlight: "none",
  showFoldingControls: "always",
};

const shellStyle = cva({
  base: {
    zIndex: "[calc(var(--z-index-sticky) + 2)]",
    pointerEvents: "auto",
  },
  variants: {
    placement: {
      // Positions against the workspace row: the dock column it renders in
      // is not positioned. One layer above the docked panels, which share the
      // base layer and come later in the row.
      floating: {
        position: "absolute",
        zIndex: "[calc(var(--z-index-sticky) + 3)]",
      },
      docked: { position: "relative", flexShrink: 0, height: "full" },
    },
  },
});

const cardStyle = cva({
  base: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    height: "full",
    overflow: "hidden",
    backgroundColor: "neutral.s00",
  },
  variants: {
    placement: {
      floating: {
        borderRadius: "xl",
        boxShadow:
          "[0 0 0 1px rgba(0,0,0,0.08), 0 4px 8px -4px rgba(0,0,0,0.12), 0 12px 32px -12px rgba(0,0,0,0.16)]",
      },
      docked: { borderLeft: "[1px solid {colors.neutral.s40}]" },
    },
  },
});

// The docked resize handle straddles the column's left border.
const resizeAnchorStyle = css({
  position: "absolute",
  top: "[0]",
  bottom: "[0]",
  left: "[0]",
  width: "[0]",
});

const headerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  height: "[40px]",
  paddingLeft: "3",
  paddingRight: "2",
  borderBottom: "[1px solid {colors.neutral.bd.subtle}]",
  flexShrink: 0,
  userSelect: "none",
});

// The title stretches over the free header space. Floating, it doubles as
// the drag handle, so most of the header moves the window.
const titleStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    flex: "[1]",
    minWidth: "[0]",
    height: "full",
    border: "none",
    padding: "[0]",
    backgroundColor: "[transparent]",
    color: "neutral.fg.heading",
    fontSize: "sm",
    fontWeight: "medium",
    whiteSpace: "nowrap",
    textAlign: "left",
  },
  variants: {
    draggable: {
      true: {
        cursor: "grab",
        touchAction: "none",
        _active: { cursor: "grabbing" },
      },
    },
  },
});

const statusStyle = css({
  fontSize: "[11px]",
  color: "neutral.s100",
  whiteSpace: "nowrap",
  paddingX: "1",
});

const headerButtonStyle = css({
  color: "neutral.s90",
  _hover: { color: "neutral.s110" },
});

const bodyStyle = css({
  display: "flex",
  flexDirection: "column",
  flex: "[1]",
  minHeight: "[0]",
});

// The editor owns the whole tab area; the workspace's text-selection lock
// stops at its boundary so the output can be copied.
const editorBoxStyle = css({
  flex: "[1]",
  minHeight: "[0]",
  userSelect: "text",
});

const notesStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "3",
  padding: "3",
  overflow: "auto",
  overscrollBehavior: "contain",
});

const footerStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  padding: "3",
  borderTop: "[1px solid {colors.neutral.bd.subtle}]",
  flexShrink: 0,
  maxHeight: "[40%]",
  overflow: "auto",
  overscrollBehavior: "contain",
});

const mutedStyle = css({
  margin: "[0]",
  fontSize: "xs",
  color: "neutral.s100",
  fontStyle: "italic",
});

const messageStyle = css({
  margin: "[0]",
  fontSize: "xs",
  color: "neutral.s115",
});

const listStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  margin: "[0]",
  paddingLeft: "4",
  fontSize: "xs",
  color: "neutral.s115",
});

/** The active tab's text in Monaco, once its grammar is registered. */
const ExportViewer = ({
  languages,
  tab,
  value,
}: {
  languages: Promise<void>;
  tab: TabId;
  value: string;
}) => {
  use(languages);
  return (
    <CodeEditor
      viewer
      path={TAB_MODELS[tab].path}
      language={TAB_MODELS[tab].language}
      value={value}
      height="100%"
      options={VIEWER_OPTIONS}
    />
  );
};

const describeItem = (item: PetriNetIrDiagnostic["item"]): string =>
  item.kind === "net" ? "The net" : `${item.kind} ${item.name}`;

const DiagnosticList = ({
  diagnostics,
}: {
  diagnostics: PetriNetIrDiagnostic[];
}) => (
  <ul className={listStyle}>
    {diagnostics.map((diagnostic) => (
      <li
        key={`${diagnostic.code}:${diagnostic.item.kind}:${diagnostic.item.id}`}
      >
        <strong>{describeItem(diagnostic.item)}</strong>: {diagnostic.message}
      </li>
    ))}
  </ul>
);

/**
 * The current net compiled to the Petri net IR, as a movable window over the
 * workspace or docked as a column beside it, between the properties panel and
 * the AI assistant. It recompiles as the net changes, starting from the
 * initial state and parameter values the Simulation Settings resolve.
 *
 * Both placements render into the side dock column, so switching between
 * them keeps the editor mounted. The placement and the width are the
 * caller's, so they outlive a closed window.
 */
export const ReactiveModulesPanel = ({
  onClose,
  placement,
  onPlacementChange,
  width,
  onWidthChange,
}: {
  onClose: () => void;
  placement: ReactiveModulesPanelPlacement;
  onPlacementChange: (placement: ReactiveModulesPanelPlacement) => void;
  /** Width in CSS pixels, shared by both placements. */
  width: number;
  onWidthChange: (width: number) => void;
}) => {
  const { petriNetDefinition, extensions, title } = use(SDCPNContext);
  const { initialMarking, parameterValues } = use(SimulationContext);
  const { requestHirArtifacts } = use(LanguageClientContext);
  const container = useSideDockContainer();
  const [activeTab, setActiveTab] = useState<TabId>("ir");
  // One grammar load per window: a failure fails this window once, and the
  // window mounted by the next show loads again.
  const [languages] = useState(loadExportLanguages);
  const isFloating = placement === "floating";
  const {
    panelRef,
    handleProps,
    getResizeHandleProps,
    style: floatingStyle,
  } = useFloatingPanel<HTMLElement>({
    width,
    onWidthChange,
    initialHeight: 520,
    initialPosition: "center",
    limits: PANEL_LIMITS,
  });

  const lambdaHir = useLambdaHir(
    petriNetDefinition,
    extensions,
    requestHirArtifacts,
  );
  const result =
    lambdaHir.lambdaHir === null
      ? null
      : compileReactiveModuleExport({
          sdcpn: petriNetDefinition,
          title,
          initialMarking,
          parameterValues,
          lambdaHir: lambdaHir.lambdaHir,
          extensions,
        });

  const status =
    lambdaHir.status === "stale"
      ? "Recompiling…"
      : lambdaHir.status === "compiling"
        ? "Compiling…"
        : null;

  const output = result === null || result.errors.length > 0 ? null : result.ir;

  if (container === null) {
    return null;
  }

  const Title = isFloating ? "button" : "div";
  const placementLabel = isFloating
    ? `Dock ${PANEL_LABEL}`
    : `Float ${PANEL_LABEL}`;

  const panel = (
    <aside
      ref={panelRef}
      role={isFloating ? "dialog" : undefined}
      aria-label={PANEL_LABEL}
      data-placement={placement}
      className={shellStyle({ placement })}
      style={isFloating ? floatingStyle : { width: `min(${width}px, 100cqw)` }}
    >
      {isFloating ? (
        <FloatingResizeHandles
          label={PANEL_LABEL}
          getHandleProps={getResizeHandleProps}
        />
      ) : (
        <div className={resizeAnchorStyle}>
          <ResizeHandle
            edge="left"
            appearance="hidden"
            size={width}
            onResize={onWidthChange}
            minSize={PANEL_LIMITS.minWidth}
            maxSize={DOCKED_MAX_WIDTH}
            label={`Resize ${PANEL_LABEL}`}
          />
        </div>
      )}
      <div className={cardStyle({ placement })}>
        <div className={headerStyle}>
          <Title
            type={isFloating ? "button" : undefined}
            className={titleStyle({ draggable: isFloating })}
            aria-label={isFloating ? `Move ${PANEL_LABEL}` : undefined}
            title={
              isFloating ? "Drag to move, or use the arrow keys" : undefined
            }
            {...(isFloating ? handleProps : {})}
          >
            {PANEL_LABEL}
          </Title>
          <HorizontalTabsHeader
            subViews={TABS}
            activeTabId={activeTab}
            onTabChange={(tabId) => setActiveTab(tabId as TabId)}
          />
          {status === null ? null : (
            <span className={statusStyle} role="status">
              {status}
            </span>
          )}
          <Button
            size="xs"
            variant="ghost"
            className={headerButtonStyle}
            aria-label={placementLabel}
            onClick={() => {
              if (!isFloating) {
                onPlacementChange("floating");
                return;
              }
              onPlacementChange("docked");
              if (width > DOCKED_MAX_WIDTH) {
                onWidthChange(DOCKED_MAX_WIDTH);
              }
            }}
            prefix={
              <ExperimentalIcon
                name={isFloating ? "sidebar" : "externalLink"}
                size={14}
              />
            }
            tooltip={placementLabel}
          />
          <Button
            size="xs"
            variant="ghost"
            className={headerButtonStyle}
            aria-label={`Close ${PANEL_LABEL}`}
            onClick={onClose}
            prefix={<ExperimentalIcon name="close" size={14} />}
            tooltip="Close"
          />
        </div>
        <div
          className={bodyStyle}
          role="tabpanel"
          id={`tabpanel-${activeTab}`}
          aria-labelledby={`tab-${activeTab}`}
        >
          {lambdaHir.status === "error" ? (
            <div className={notesStyle}>
              <p className={messageStyle}>
                The net&apos;s code could not be compiled: {lambdaHir.error}
              </p>
            </div>
          ) : result === null ? (
            <div className={notesStyle}>
              <p className={mutedStyle}>Compiling…</p>
            </div>
          ) : output === null ? (
            <div className={notesStyle}>
              <p className={messageStyle}>
                This net cannot be compiled to a reactive module yet.
              </p>
              <DiagnosticList diagnostics={result.errors} />
            </div>
          ) : (
            <>
              <div className={editorBoxStyle}>
                <Suspense
                  fallback={
                    <div className={notesStyle}>
                      <p className={mutedStyle}>Loading editor…</p>
                    </div>
                  }
                >
                  <ExportViewer
                    languages={languages}
                    tab={activeTab}
                    value={output}
                  />
                </Suspense>
              </div>
              {result.warnings.length > 0 ? (
                <div className={footerStyle}>
                  <p className={mutedStyle}>Left out of the net:</p>
                  <DiagnosticList diagnostics={result.warnings} />
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </aside>
  );

  return container === undefined ? panel : createPortal(panel, container);
};
