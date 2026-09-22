import { use, useState } from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { compileReactiveModuleExport } from "@hashintel/petrinaut-core/reactive-modules";

import { LanguageClientContext } from "../../../../react/lsp/context";
import { SimulationContext } from "../../../../react/simulation/context";
import { SDCPNContext } from "../../../../react/state/sdcpn-context";
import { HorizontalTabsHeader } from "../../../components/sub-view/horizontal/horizontal-tabs-container";
import { ExperimentalIcon } from "../../../experimental-icons";
import { FloatingResizeHandles } from "../shared/floating-resize-handles";
import { useFloatingPanel } from "../shared/use-floating-panel";
import { useLambdaHir } from "./reactive-modules-panel/use-lambda-hir";

import type { HorizontalTabView } from "../../../components/sub-view/horizontal/horizontal-tabs-container";
import type { PetriNetIrDiagnostic } from "@hashintel/petrinaut-core/reactive-modules";

const PANEL_LABEL = "Zeroth Reactive Modules";

type TabId = "ir" | "python";

const TABS: (HorizontalTabView & { id: TabId })[] = [
  { id: "ir", title: "Petri Net IR" },
  { id: "python", title: "Python Reactive Module" },
];

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
  gap: "3",
  flex: "[1]",
  minHeight: "[0]",
  overflow: "auto",
  padding: "3",
});

// The workspace disables text selection; the output is there to be copied.
const outputStyle = css({
  margin: "[0]",
  fontFamily: "mono",
  fontSize: "[12px]",
  lineHeight: "[1.5]",
  whiteSpace: "pre",
  color: "neutral.s115",
  userSelect: "text",
  cursor: "text",
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
            <p className={messageStyle}>
              The net&apos;s code could not be compiled: {lambdaHir.error}
            </p>
          ) : result === null ? (
            <p className={mutedStyle}>Compiling…</p>
          ) : result.errors.length > 0 ? (
            <>
              <p className={messageStyle}>
                This net cannot be compiled to a reactive module yet.
              </p>
              <DiagnosticList diagnostics={result.errors} />
            </>
          ) : (
            <>
              <pre className={outputStyle}>
                {activeTab === "ir" ? result.ir : result.python}
              </pre>
              {result.warnings.length > 0 ? (
                <>
                  <p className={mutedStyle}>Left out of the net:</p>
                  <DiagnosticList diagnostics={result.warnings} />
                </>
              ) : null}
            </>
          )}
        </div>
      </div>
    </aside>
  );
};
