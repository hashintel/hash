/**
 * @layerRoot ui.preview
 * @role Composes the shared canvas and inspectors into a compact read-only embed
 */

import "@fontsource-variable/inter";
import "@fontsource-variable/inter-tight";
import "@fontsource-variable/jetbrains-mono";
import "@xyflow/react/dist/style.css";
import "../index.css";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  type FunctionComponent,
} from "react";

import { PortalContainerContext } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";
import {
  createJsonDocHandle,
  createPetrinaut,
  type Petrinaut as PetrinautInstance,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import {
  PetrinautNavigationProvider,
  type PetrinautNavigationController,
} from "../../react/navigation";
import {
  PetrinautCanvasProvider,
  PetrinautDocumentProvider,
} from "../../react/petrinaut-provider-layers";
import { SDCPNView } from "../views/SDCPN/sdcpn-view";
import { PetrinautPresentationProvider } from "../views/shared/presentation-context";
import {
  createPreviewNavigationAdapter,
  type PetrinautPreviewNavigationState,
} from "./navigation-adapter";
import { PreviewNetNavigation } from "./preview-net-navigation";
import { PreviewPropertiesPanel } from "./properties-panel";

import type { NetManagement } from "../../react/net-management-context";
import type { ViewportAction } from "../types/viewport-action";

const noop = () => {};

const previewRootStyle = css({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  width: "full",
  height: "full",
  minWidth: "0",
  minHeight: "0",
  overflow: "hidden",
  backgroundColor: "neutral.s25",
  color: "neutral.fg.body",
});

// The editor's top bar at embed height: the same flat 1px outline, padding
// rhythm, and title weight, with no shadow.
const previewHeaderStyle = css({
  position: "relative",
  zIndex: "sticky",
  display: "flex",
  alignItems: "center",
  gap: "[12px]",
  height: "12",
  flexShrink: "0",
  boxSizing: "border-box",
  paddingX: "[16px]",
  backgroundColor: "neutral.s00",
  outlineWidth: "[1px]",
  outlineStyle: "solid",
  outlineColor: "neutral.s40",
});

const previewTitleStyle = css({
  flex: "1",
  minWidth: "0",
  marginX: "2",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.fg.heading",
});

const previewBadgeStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  flexShrink: "0",
  paddingX: "1.5",
  paddingY: "0.5",
  backgroundColor: "neutral.s15",
  color: "neutral.s90",
  fontSize: "[10px]",
  fontWeight: "semibold",
  textTransform: "uppercase",
  letterSpacing: "[0.4px]",
});

// The canvas and the docked inspector share the row; narrow viewports stack
// the inspector under the canvas instead.
const previewMainStyle = css({
  position: "relative",
  display: "flex",
  flex: "1",
  minWidth: "0",
  minHeight: "0",
  "@media (max-width: 640px)": {
    flexDirection: "column",
  },
});

const previewCanvasStyle = css({
  position: "relative",
  flex: "1",
  minWidth: "0",
  minHeight: "0",
});

export type PetrinautPreviewProps = {
  /** The immutable model snapshot to display. */
  definition: SDCPN;
  /** Stable identity for the in-memory document created by Preview. */
  documentId?: string;
  title?: string;
  /**
   * Optional host-owned navigation. The host may project this state into any
   * router; Preview itself does not depend on a router implementation.
   */
  navigation?: PetrinautNavigationController<PetrinautPreviewNavigationState>;
  /** Host actions displayed alongside the canvas zoom controls. */
  viewportActions?: ViewportAction[];
};

/**
 * Compact, read-only Petrinaut surface intended for an iframe embed.
 *
 * The component creates a history-free read-only document and renders the
 * exact same {@link SDCPNView} as the editor. It intentionally mounts neither
 * Monaco/LSP nor experiments, optimizations, AI, or simulation controls.
 */
export const PetrinautPreview: FunctionComponent<PetrinautPreviewProps> = ({
  definition,
  documentId,
  navigation,
  title = "Petrinaut model",
  viewportActions,
}) => {
  const generatedDocumentId = useId();
  const portalContainerRef = useRef<HTMLDivElement>(null);
  const handle = useMemo(
    () =>
      createJsonDocHandle({
        id: documentId ?? `petrinaut-preview-${generatedDocumentId}`,
        initial: definition,
        capabilities: { readonly: true },
        historyLimit: 0,
      }),
    [definition, documentId, generatedDocumentId],
  );
  const instance = useMemo<PetrinautInstance>(
    () => createPetrinaut({ document: handle, readonly: true }),
    [handle],
  );
  const navigationAdapter = useMemo(
    () => (navigation ? createPreviewNavigationAdapter(navigation) : undefined),
    [navigation],
  );
  const netManagement = useMemo<NetManagement>(
    () => ({
      title,
      setTitle: noop,
      existingNets: [],
      createNewNet: noop,
      loadPetriNet: noop,
    }),
    [title],
  );

  useEffect(() => () => instance.dispose(), [instance]);

  return (
    <PortalContainerContext value={portalContainerRef}>
      <PetrinautDocumentProvider
        instance={instance}
        netManagement={netManagement}
      >
        <PetrinautNavigationProvider
          controller={navigationAdapter}
          initialState={{
            mode: "edit",
            simulateView: "scenarios",
          }}
          key={handle.id}
        >
          <PetrinautPresentationProvider profile="preview">
            <PetrinautCanvasProvider>
              <div
                ref={portalContainerRef}
                className={cx(previewRootStyle, "petrinaut-root")}
              >
                <header className={previewHeaderStyle}>
                  <PreviewNetNavigation />
                  <span className={previewTitleStyle} title={title}>
                    {title}
                  </span>
                  <span className={previewBadgeStyle}>View only</span>
                </header>
                <main className={previewMainStyle}>
                  <div className={previewCanvasStyle}>
                    <SDCPNView viewportActions={viewportActions} />
                  </div>
                  <PreviewPropertiesPanel />
                </main>
              </div>
            </PetrinautCanvasProvider>
          </PetrinautPresentationProvider>
        </PetrinautNavigationProvider>
      </PetrinautDocumentProvider>
    </PortalContainerContext>
  );
};
