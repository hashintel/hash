import { use, useState } from "react";

import { Button, Menu, type MenuItem } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { MenuIcon } from "@hashintel/ds-icons";
import {
  generatePetrinautId,
  inlineImports,
  type DocumentFormat,
} from "@hashintel/petrinaut-core";

import { CompositionContext } from "../../../../../react/document/composition-context";
import { SDCPNContext } from "../../../../../react/document/sdcpn-context";
import { useIsReadOnly } from "../../../../../react/editing/use-is-read-only";
import { NetManagementContext } from "../../../../../react/host/net-management-context";
import { usePetrinautNavigate } from "../../../../../react/navigation/navigation";
import { useEditorActions } from "../../../../../react/state/editor-context";
import { useCanvasRegistration } from "../../../../plugins/plugin-editor";
import { KeyboardShortcut } from "../../../../shared/keyboard-shortcut";
import { exportSDCPN } from "../../shared/file-io/export-sdcpn";
import { exportTikZ } from "../../shared/file-io/export-tikz";
import { importSDCPN } from "../../shared/file-io/import-sdcpn";
import {
  autoLayoutShortcut,
  useAutoLayoutAndFrame,
} from "../../shared/use-auto-layout-and-frame";
import { useCreateEmptyNet } from "../../shared/use-create-empty-net";
import { exampleNets } from "./editor-menu/example-nets";
import { formatRelativeTime } from "./editor-menu/format-relative-time";
import { ImportErrorDialog } from "./editor-menu/import-error-dialog";
import { layOutNet } from "./editor-menu/lay-out-net";

const openSubmenuStyle = css({
  "--dropdown-max-width": "min(600px, 70vw)",
  "--dropdown-max-height": "min(800px, 80vh)",
});

const netTitleStyle = css({
  minWidth: "0",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const exportFormats: { format: DocumentFormat; label: string }[] = [
  { format: "yaml", label: "YAML" },
  { format: "json", label: "JSON" },
];

/**
 * The editor's main menu, and the dialog that reports a failed import. A host
 * that manages nets itself gets no item that opens, creates or imports one.
 */
export const EditorMenu = ({
  showNetManagementItems,
}: {
  showNetManagementItems: boolean;
}) => {
  const { petriNetDefinition } = use(SDCPNContext);
  const { createNewNet, existingNets, loadPetriNet, title } =
    use(NetManagementContext);
  const { libraries } = use(CompositionContext);
  const navigate = usePetrinautNavigate();
  const { requestFrameOnNextRegistration } = useCanvasRegistration();
  const { clearSelection } = useEditorActions();
  // Auto-layout moves nodes, which a read-only net rejects, so the menu would
  // otherwise offer an item that silently does nothing.
  const isReadOnly = useIsReadOnly();
  const createEmptyNet = useCreateEmptyNet();
  const autoLayoutAndFrame = useAutoLayoutAndFrame();
  const [importError, setImportError] = useState<string | null>(null);

  const openNet = (net: Parameters<typeof createNewNet>[0]) => {
    createNewNet(net);
    clearSelection();
  };

  const importNet = async () => {
    const result = await importSDCPN();
    if (!result) {
      return; // The file picker was cancelled.
    }
    if (!result.ok) {
      setImportError(result.error);
      return;
    }

    const { sdcpn, hadMissingPositions } = result;
    // The layout runs before the net opens, so the net opens once, laid out.
    const net = hadMissingPositions ? await layOutNet(sdcpn) : sdcpn;
    if (hadMissingPositions) {
      requestFrameOnNextRegistration();
    }
    openNet({ title: sdcpn.title, petriNetDefinition: net });
  };

  const items: MenuItem[] = [
    ...(showNetManagementItems
      ? [{ id: "new", text: "New", onClick: createEmptyNet }]
      : []),
    ...(showNetManagementItems && existingNets.length > 0
      ? [
          {
            id: "open",
            text: "Open",
            className: openSubmenuStyle,
            subItems: existingNets.map((net) => ({
              id: `open-${net.netId}`,
              text: <span className={netTitleStyle}>{net.title}</span>,
              suffix: formatRelativeTime(net.lastUpdated),
              onClick: () => {
                loadPetriNet(net.netId);
                clearSelection();
              },
            })),
          },
        ]
      : []),
    {
      id: "export",
      text: "Export",
      subItems: [
        ...exportFormats.flatMap(({ format, label }) => [
          {
            id: `export-${format}`,
            text: label,
            onClick: () => exportSDCPN({ petriNetDefinition, title, format }),
          },
          {
            id: `export-${format}-without-visuals`,
            text: `${label} without visual info`,
            onClick: () =>
              exportSDCPN({
                petriNetDefinition,
                title,
                removeVisualInfo: true,
                format,
              }),
          },
        ]),
        // Offered where there is something to inline: the document with what
        // it takes from its libraries made its own, so it reads without them.
        ...((petriNetDefinition.imports ?? []).length > 0
          ? exportFormats.map(({ format, label }) => ({
              id: `export-${format}-inlined`,
              text: `${label} with imports inlined`,
              onClick: () =>
                exportSDCPN({
                  petriNetDefinition: inlineImports(
                    petriNetDefinition,
                    libraries,
                    generatePetrinautId,
                  ),
                  title,
                  format,
                }),
            }))
          : []),
        {
          id: "export-tikz",
          text: "TikZ",
          onClick: () => exportTikZ({ petriNetDefinition, title }),
        },
      ],
    },
    ...(showNetManagementItems
      ? [{ id: "import", text: "Import", onClick: importNet }]
      : []),
    ...(isReadOnly
      ? []
      : [
          {
            id: "layout",
            text: "Layout",
            suffix: <KeyboardShortcut shortcut={autoLayoutShortcut} inMenu />,
            onClick: () => {
              void autoLayoutAndFrame();
            },
          },
        ]),
    ...(showNetManagementItems
      ? [
          {
            id: "load-example",
            text: "Load example",
            subItems: exampleNets.map(({ id, label, net }) => ({
              id: `load-example-${id}`,
              text: label,
              onClick: () => openNet(net),
            })),
          },
        ]
      : []),
    {
      id: "user-settings",
      text: "User settings",
      suffix: <KeyboardShortcut shortcut="mod+," inMenu />,
      onClick: () =>
        navigate(
          { overlay: { type: "user-settings", section: "general" } },
          { cause: "user", action: "overlay" },
        ),
    },
    {
      id: "docs",
      text: "Docs",
      onClick: () => {
        window.open(
          "https://github.com/hashintel/hash/tree/main/libs/%40hashintel/petrinaut/docs",
          "_blank",
          "noopener,noreferrer",
        );
      },
    },
  ];

  return (
    <>
      <Menu
        trigger={
          <Button
            aria-label="Menu"
            size="sm"
            variant="ghost"
            tooltip="Menu"
            prefix={<MenuIcon size={16} duration={200} />}
          />
        }
        items={items}
      />
      {importError !== null && (
        <ImportErrorDialog
          message={importError}
          onClose={() => setImportError(null)}
          onCreateEmpty={createEmptyNet}
        />
      )}
    </>
  );
};
