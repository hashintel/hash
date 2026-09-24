import {
  Suspense,
  use,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";

import { Button } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";
import {
  compileReactiveModuleExport,
  resolveZerothTarget,
} from "@hashintel/petrinaut-core/reactive-modules";

import { LanguageClientContext } from "../../../../react/lsp/context";
import { SimulationContext } from "../../../../react/simulation/context";
import { EditorContext } from "../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../react/state/sdcpn-context";
import { UserSettingsContext } from "../../../../react/state/user-settings-context";
import { HorizontalTabsHeader } from "../../../components/sub-view/horizontal/horizontal-tabs-container";
import { ExperimentalIcon } from "../../../experimental-icons";
import { CodeEditor } from "../../../monaco/code-editor";
import { ResizeHandle } from "../../../resize/resize-handle";
import { FloatingResizeHandles } from "../shared/floating-resize-handles";
import { useSideDockContainer } from "../shared/side-dock";
import { useFloatingPanel } from "../shared/use-floating-panel";
import { FilesPanel } from "./reactive-modules-panel/files-panel";
import { loadExportLanguages } from "./reactive-modules-panel/monaco-languages";
import {
  attachProvenanceListeners,
  bindTrace,
  registerProvenanceHover,
  unbindTrace,
  type ProvenanceListeners,
} from "./reactive-modules-panel/provenance-hover";
import { TargetHeader } from "./reactive-modules-panel/target-header";
import { useLambdaHir } from "./reactive-modules-panel/use-lambda-hir";

import type { HorizontalTabView } from "../../../components/sub-view/horizontal/horizontal-tabs-container";
import type { CodeEditorProps } from "../../../monaco/code-editor";
import type {
  PetriNetIrDiagnostic,
  PetriNetIrOrigins,
  Trace,
  ZerothTarget,
} from "@hashintel/petrinaut-core/reactive-modules";

const PANEL_LABEL = "Zeroth Reactive Modules";

/** A movable window over the workspace, or a column beside it. */
export type ReactiveModulesPanelPlacement = "docked" | "floating";

/** Width bounds in CSS pixels. */
const PANEL_LIMITS = { minWidth: 360, maxWidth: 1200 };

// The AI assistant's docked cap. A wider column docked beside the assistant
// leaves the workspace, which is the only row item that gives way, no room.
const DOCKED_MAX_WIDTH = 720;

type TabId = "ir" | "python";

const TABS: (HorizontalTabView & { id: TabId })[] = [
  { id: "ir", title: "Petri Net IR" },
  { id: "python", title: "Python Reactive Module" },
];

/**
 * The models' home; the scheme keeps them apart from the language server's
 * documents. Each Python file gets a model of its own under it.
 */
const PYTHON_MODEL_ROOT = "petrinaut-reactive-modules://export/";

/**
 * One Monaco model per tab, so each keeps its own scroll position and
 * collapsed regions while the other is shown. The Python entry is the main
 * file's model, the one shown when no file is selected.
 */
const TAB_MODELS: Record<TabId, { language: string; path: string }> = {
  ir: { language: "yaml", path: `${PYTHON_MODEL_ROOT}net.pn.yaml` },
  python: { language: "python", path: `${PYTHON_MODEL_ROOT}net.py` },
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

/** The AI assistant's placement transition, matched so the two move alike. */
const PLACEMENT_TRANSITION_MS = 150;

const prefersReducedMotion = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Reserves the docked width in the column, as the assistant's spacer does in
// the row, so the width can transition while the window itself moves.
const dockSpaceStyle = css({
  width: "[min(var(--dock-width), 100cqw)]",
  flexShrink: 0,
  minWidth: "[0]",
  maxWidth: "[100%]",
  pointerEvents: "none",
  '&[data-animating="true"]': {
    transition: "[width 150ms ease-in-out]",
    "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
  },
});

// Always absolute, so a placement change is a move rather than a reflow.
// Docked, it covers the column's spacer, whose right edge does not move as
// the spacer widens. Floating, it positions against the workspace row: the
// column is positioned only while a panel is docked in it.
const shellStyle = cva({
  base: {
    position: "absolute",
    pointerEvents: "auto",
    // Passes over the docked panels while it moves between placements.
    '&[data-animating="true"]': {
      zIndex: "[calc(var(--z-index-sticky) + 3)]",
    },
  },
  variants: {
    placement: {
      // One layer above the docked panels, which come later in the row.
      floating: { zIndex: "[calc(var(--z-index-sticky) + 3)]" },
      docked: {
        top: "[0]",
        right: "[0]",
        width: "[min(var(--dock-width), 100cqw)]",
        height: "full",
        zIndex: "[calc(var(--z-index-sticky) + 2)]",
      },
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
    borderLeft: "[1px solid {colors.neutral.s40}]",
    '[data-animating="true"] > &': {
      transition:
        "[border-radius 150ms ease-in-out, box-shadow 150ms ease-in-out, border-color 150ms ease-in-out]",
      "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
    },
  },
  variants: {
    placement: {
      floating: {
        borderLeftColor: "[transparent]",
        borderRadius: "xl",
        boxShadow:
          "[0 0 0 1px rgba(0,0,0,0.08), 0 4px 8px -4px rgba(0,0,0,0.12), 0 12px 32px -12px rgba(0,0,0,0.16)]",
      },
      docked: {},
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

// The title and the status share the header's free space, so a status that
// appears while the net recompiles shortens the title and leaves the tabs
// where they were.
const titleAreaStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  flex: "[1]",
  minWidth: "[0]",
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

// The editor and, on the Python tab, the file list beside it.
const splitStyle = css({
  display: "flex",
  flex: "[1]",
  minHeight: "[0]",
});

// The editor owns the tab area left of the file list; the workspace's
// text-selection lock stops at its boundary so the output can be copied.
const editorBoxStyle = css({
  flex: "[1]",
  minWidth: "[0]",
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

/** The model's path inside the scheme, the key the hover provider reads. */
const modelPathOf = (path: string): string => {
  const [, rest = ""] = path.split("://");
  const slash = rest.indexOf("/");
  return slash === -1 ? "/" : rest.slice(slash);
};

/**
 * The shown text in Monaco, once its grammar is registered. The trace of the
 * text is bound to its model, so a hover explains the line under the pointer
 * and a place's or a transition's lines light the item on the canvas.
 */
const ExportViewer = ({
  languages,
  tab,
  path,
  value,
  trace,
  origins,
  explain,
}: {
  languages: Promise<void>;
  tab: TabId;
  /** The model's path; one model per file keeps each file's view state. */
  path: string;
  value: string;
  trace: Trace | null;
  origins: PetriNetIrOrigins | null;
  /** Whether the hover reads the trace; off, the editor is plain text. */
  explain: boolean;
}) => {
  use(languages);
  const { setHoveredItem, clearHoveredItem, selectItem } = use(EditorContext);
  const listenersRef = useRef<ProvenanceListeners>({
    onHoverItem: () => {},
    onSelectItem: () => {},
  });
  const detachRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    listenersRef.current = {
      onHoverItem: (item) => {
        if (item === null) {
          clearHoveredItem();
        } else {
          setHoveredItem(item);
        }
      },
      onSelectItem: selectItem,
    };
  });
  useEffect(() => {
    const key = modelPathOf(path);
    const binding = {
      trace: explain ? (trace ?? []) : [],
      origins,
      text: value,
    };
    bindTrace(key, binding);
    return () => unbindTrace(key, binding);
  }, [path, trace, origins, explain, value]);
  useEffect(() => () => detachRef.current?.(), []);
  return (
    <CodeEditor
      viewer
      path={path}
      language={TAB_MODELS[tab].language}
      value={value}
      height="100%"
      options={VIEWER_OPTIONS}
      onMount={(instance, monaco) => {
        registerProvenanceHover(monaco);
        detachRef.current?.();
        detachRef.current = attachProvenanceListeners(
          instance,
          () => listenersRef.current,
        );
      }}
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
 * The current net compiled to the Petri net IR and to a Zeroth reactive
 * module, as a movable window over the workspace or docked as a column
 * beside it, between the properties panel and the AI assistant. It
 * recompiles as the net changes, starting from the initial state and
 * parameter values the Simulation Settings resolve. The compiler flags live
 * in the window and are written into the IR, so both tabs show the same
 * compilation.
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
  const { initialMarking, parameterValues, dt } = use(SimulationContext);
  const { requestHirArtifacts } = use(LanguageClientContext);
  const container = useSideDockContainer();
  const { showAnimations } = use(UserSettingsContext);
  const [activeTab, setActiveTab] = useState<TabId>("ir");
  const [flags, setFlags] = useState<ZerothTarget>({});
  const [selectedFile, setSelectedFile] = useState("net.py");
  const [filesOpen, setFilesOpen] = useState(true);
  // Off until asked: the explanations light the canvas as the pointer moves.
  const [explainOnHover, setExplainOnHover] = useState(false);
  const target = resolveZerothTarget({ ...flags, dt });
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
  const spacerRef = useRef<HTMLDivElement | null>(null);
  // The window's box before a placement change, for the move that follows.
  const pendingMoveRef = useRef<{
    from: ReactiveModulesPanelPlacement;
    rect: DOMRect;
  } | null>(null);

  // Moves the window from where it was to where the new placement puts it,
  // while the spacer's width and the card's edges transition alongside. A
  // transform bridges the two containing blocks, which CSS cannot transition.
  useLayoutEffect(() => {
    const pending = pendingMoveRef.current;
    pendingMoveRef.current = null;
    const shell = panelRef.current;
    const spacer = spacerRef.current;
    if (
      pending === null ||
      pending.from === placement ||
      !shell ||
      !spacer ||
      typeof shell.animate !== "function" ||
      prefersReducedMotion()
    ) {
      return;
    }
    const to = shell.getBoundingClientRect();
    shell.dataset.animating = "true";
    spacer.dataset.animating = "true";
    const settle = () => {
      delete shell.dataset.animating;
      delete spacer.dataset.animating;
    };
    const animation = shell.animate(
      [
        {
          transformOrigin: "top left",
          transform: `translate(${pending.rect.left - to.left}px, ${pending.rect.top - to.top}px)`,
          width: `${pending.rect.width}px`,
          height: `${pending.rect.height}px`,
        },
        {
          transformOrigin: "top left",
          transform: "none",
          width: `${to.width}px`,
          height: `${to.height}px`,
        },
      ],
      { duration: PLACEMENT_TRANSITION_MS, easing: "ease-in-out" },
    );
    animation.addEventListener("finish", settle);
    // A cancelled animation's events arrive later, after the next move has
    // marked itself as animating, so the listener goes before the cancel.
    return () => {
      animation.removeEventListener("finish", settle);
      animation.cancel();
      settle();
    };
  }, [placement, panelRef]);

  const lambdaHir = useLambdaHir(
    petriNetDefinition,
    extensions,
    requestHirArtifacts,
  );
  const result =
    lambdaHir.netHir === null
      ? null
      : compileReactiveModuleExport({
          sdcpn: petriNetDefinition,
          title,
          initialMarking,
          parameterValues,
          ...lambdaHir.netHir,
          extensions,
          zeroth: target,
        });

  const status =
    lambdaHir.status === "stale"
      ? "Recompiling…"
      : lambdaHir.status === "compiling"
        ? "Compiling…"
        : null;

  // The Python tab shows one of the compiled files: the selected one, or the
  // main file when the layout no longer writes the selected one.
  const files = result?.files ?? null;
  const shownFile =
    files === null
      ? null
      : (files.find((file) => file.path === selectedFile) ?? files[0] ?? null);
  // The IR stands on its own when only the lowering refuses the net, so the
  // IR tab shows the document while the Python tab lists what stops it.
  const output =
    result === null
      ? null
      : activeTab === "ir"
        ? result.ir
        : (shownFile?.text ?? null);

  if (container === null) {
    return null;
  }

  const Title = isFloating ? "button" : "div";
  const placementLabel = isFloating
    ? `Dock ${PANEL_LABEL}`
    : `Float ${PANEL_LABEL}`;
  // One file needs no list; the toggle and the list appear with a second.
  const listedFiles = files !== null && files.length > 1 ? files : null;
  const filesLabel = filesOpen ? "Hide files" : "Show files";
  const explainLabel = explainOnHover
    ? "Stop explaining lines on hover"
    : "Explain lines on hover";
  // The docked width, read by the spacer and the window through CSS.
  const dockedStyle = { "--dock-width": `${width}px` } as CSSProperties;
  const spacerStyle = {
    "--dock-width": isFloating ? "0px" : `${width}px`,
  } as CSSProperties;

  const togglePlacement = () => {
    const shell = panelRef.current;
    pendingMoveRef.current =
      showAnimations && shell
        ? { from: placement, rect: shell.getBoundingClientRect() }
        : null;
    if (!isFloating) {
      onPlacementChange("floating");
      return;
    }
    onPlacementChange("docked");
    if (width > DOCKED_MAX_WIDTH) {
      onWidthChange(DOCKED_MAX_WIDTH);
    }
  };

  const panel = (
    <>
      <div
        ref={spacerRef}
        aria-hidden="true"
        data-dock-space
        className={dockSpaceStyle}
        style={spacerStyle}
      />
      <aside
        ref={panelRef}
        role={isFloating ? "dialog" : undefined}
        aria-label={PANEL_LABEL}
        data-placement={placement}
        className={shellStyle({ placement })}
        style={isFloating ? floatingStyle : dockedStyle}
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
            <div className={titleAreaStyle}>
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
              {status === null ? null : (
                <span className={statusStyle} role="status">
                  {status}
                </span>
              )}
            </div>
            <HorizontalTabsHeader
              subViews={TABS}
              activeTabId={activeTab}
              onTabChange={(tabId) => setActiveTab(tabId as TabId)}
            />
            <Button
              size="xs"
              variant="ghost"
              className={headerButtonStyle}
              aria-label={explainLabel}
              pressed={explainOnHover}
              onClick={() => setExplainOnHover(!explainOnHover)}
              prefix={<ExperimentalIcon name="info" size={14} />}
              tooltip={explainLabel}
            />
            <Button
              size="xs"
              variant="ghost"
              className={headerButtonStyle}
              aria-label={placementLabel}
              onClick={togglePlacement}
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
              <>
                {activeTab === "python" && result.document !== null ? (
                  <TargetHeader
                    target={target}
                    document={result.document}
                    onChange={(patch) => setFlags({ ...flags, ...patch })}
                  />
                ) : null}
                <div className={notesStyle}>
                  <p className={messageStyle}>
                    {activeTab === "ir"
                      ? "This net cannot be written as a Petri net IR yet."
                      : "This net cannot be compiled to a reactive module yet."}
                  </p>
                  <DiagnosticList diagnostics={result.errors} />
                </div>
              </>
            ) : (
              <>
                {activeTab === "python" ? (
                  <TargetHeader
                    target={target}
                    document={result.document}
                    onChange={(patch) => setFlags({ ...flags, ...patch })}
                  >
                    {listedFiles === null ? null : (
                      <Button
                        size="xs"
                        variant="ghost"
                        className={headerButtonStyle}
                        aria-label={filesLabel}
                        onClick={() => setFilesOpen(!filesOpen)}
                        prefix={
                          <ExperimentalIcon
                            name="sidebar"
                            collapsed={!filesOpen}
                            size={14}
                          />
                        }
                        tooltip={filesLabel}
                      />
                    )}
                  </TargetHeader>
                ) : null}
                <div className={splitStyle}>
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
                        path={
                          activeTab === "ir" || shownFile === null
                            ? TAB_MODELS[activeTab].path
                            : `${PYTHON_MODEL_ROOT}${shownFile.path}`
                        }
                        value={output}
                        trace={
                          activeTab === "ir"
                            ? result.irTrace
                            : (shownFile?.trace ?? null)
                        }
                        origins={result.origins}
                        explain={explainOnHover}
                      />
                    </Suspense>
                  </div>
                  {activeTab === "python" &&
                  listedFiles !== null &&
                  shownFile !== null ? (
                    <FilesPanel
                      files={listedFiles}
                      selected={shownFile.path}
                      onSelect={setSelectedFile}
                      open={filesOpen}
                    />
                  ) : null}
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
    </>
  );

  return container === undefined ? panel : createPortal(panel, container);
};
