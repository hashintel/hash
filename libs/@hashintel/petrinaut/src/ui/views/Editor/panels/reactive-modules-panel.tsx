import { Suspense, use, useState } from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { compileReactiveModuleExport } from "@hashintel/petrinaut-core/reactive-modules";

import { LanguageClientContext } from "../../../../react/lsp/context";
import { SimulationContext } from "../../../../react/simulation/context";
import { SDCPNContext } from "../../../../react/state/sdcpn-context";
import { HorizontalTabsHeader } from "../../../components/sub-view/horizontal/horizontal-tabs-container";
import { ExperimentalIcon } from "../../../experimental-icons";
import { CodeEditor } from "../../../monaco/code-editor";
import { FloatingResizeHandles } from "../shared/floating-resize-handles";
import { useFloatingPanel } from "../shared/use-floating-panel";
import { loadExportLanguages } from "./reactive-modules-panel/monaco-languages";
import { useLambdaHir } from "./reactive-modules-panel/use-lambda-hir";

import type { HorizontalTabView } from "../../../components/sub-view/horizontal/horizontal-tabs-container";
import type { CodeEditorProps } from "../../../monaco/code-editor";
import type { PetriNetIrDiagnostic } from "@hashintel/petrinaut-core/reactive-modules";

const PANEL_LABEL = "Zeroth Reactive Modules";

type TabId = "ir" | "python";

const TABS: (HorizontalTabView & { id: TabId })[] = [
  { id: "ir", title: "Petri Net IR" },
  { id: "python", title: "Python Reactive Module" },
];

/**
 * One Monaco model per tab, so each keeps its own scroll position and
 * collapsed regions while the other is shown. The scheme keeps them apart from the language
 * server's documents.
 */
const TAB_MODELS: Record<TabId, { language: string; path: string }> = {
  ir: {
    language: "yaml",
    path: "petrinaut-reactive-modules://export/net.pn.yaml",
  },
  python: {
    language: "python",
    path: "petrinaut-reactive-modules://export/net.py",
  },
};

const VIEWER_OPTIONS: CodeEditorProps["options"] = {
  readOnly: true,
  domReadOnly: true,
  lineNumbers: "on",
  renderLineHighlight: "none",
  showFoldingControls: "always",
  scrollbar: { alwaysConsumeMouseWheel: false },
};

const shellStyle = css({
  position: "absolute",
  zIndex: "[calc(var(--z-index-sticky) + 2)]",
  pointerEvents: "auto",
});

const cardStyle = css({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  height: "full",
  overflow: "hidden",
  backgroundColor: "neutral.s00",
  borderRadius: "xl",
  boxShadow:
    "[0 0 0 1px rgba(0,0,0,0.08), 0 4px 8px -4px rgba(0,0,0,0.12), 0 12px 32px -12px rgba(0,0,0,0.16)]",
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

// The title doubles as the drag handle and stretches over the free header
// space, so most of the header moves the window.
const dragHandleStyle = css({
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
  cursor: "grab",
  touchAction: "none",
  _active: { cursor: "grabbing" },
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
const ExportViewer = ({ tab, value }: { tab: TabId; value: string }) => {
  use(loadExportLanguages());
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
 * A floating, resizable window showing the current net compiled to the
 * Petri net IR and to a Zeroth reactive module. It recompiles as the net
 * changes, starting from the initial state and parameter values the
 * Simulation Settings resolve.
 */
export const ReactiveModulesPanel = ({ onClose }: { onClose: () => void }) => {
  const { petriNetDefinition, extensions, title } = use(SDCPNContext);
  const { initialMarking, parameterValues, dt } = use(SimulationContext);
  const { requestHirArtifacts } = use(LanguageClientContext);
  const [activeTab, setActiveTab] = useState<TabId>("ir");
  const [width, setWidth] = useState(560);
  const { panelRef, handleProps, getResizeHandleProps, style } =
    useFloatingPanel<HTMLElement>({
      width,
      onWidthChange: setWidth,
      initialHeight: 520,
      initialPosition: "center",
      limits: { minWidth: 360, maxWidth: 1200 },
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
          dt,
        });

  const status =
    lambdaHir.status === "stale"
      ? "Recompiling…"
      : lambdaHir.status === "compiling"
        ? "Compiling…"
        : null;

  const output =
    result === null || result.errors.length > 0
      ? null
      : activeTab === "ir"
        ? result.ir
        : result.python;

  return (
    <aside
      ref={panelRef}
      role="dialog"
      aria-label={PANEL_LABEL}
      className={shellStyle}
      style={style}
    >
      <FloatingResizeHandles
        label={PANEL_LABEL}
        getHandleProps={getResizeHandleProps}
      />
      <div className={cardStyle}>
        <div className={headerStyle}>
          <button
            type="button"
            className={dragHandleStyle}
            aria-label={`Move ${PANEL_LABEL}`}
            title="Drag to move, or use the arrow keys"
            {...handleProps}
          >
            {PANEL_LABEL}
          </button>
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
                  <ExportViewer tab={activeTab} value={output} />
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
};
