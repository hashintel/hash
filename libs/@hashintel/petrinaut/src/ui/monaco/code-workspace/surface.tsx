import { use, useState } from "react";

import { Button, Icon, Menu } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { EditorContext } from "../../../react/state/editor-context";
import { useIsReadOnly } from "../../../react/state/use-is-read-only";
import { UserSettingsContext } from "../../../react/state/user-settings-context";
import { GlassPanel } from "../../components/glass-panel";
import { UI_MESSAGES } from "../../constants/ui-messages";
import { CodeEditor } from "../code-editor";

import type { CodeEditorPlacement } from "../../../react/state/user-settings-context";
import type { CodeEntry } from "./entries";
import type { editor } from "monaco-editor";

const surfaceStyle = css({
  position: "absolute",
  top: "[0]",
  right: "[0]",
  bottom: "[0]",
  zIndex: "[calc(var(--z-index-sticky) - 1)]",
  background: "neutral.s00",
  borderLeftWidth: "thin",
  borderTopWidth: "thin",
  borderColor: "neutral.bd.subtle",
});
const contentStyle = css({
  display: "flex",
  flexDirection: "column",
  minHeight: "[0]",
  height: "full",
  overflow: "hidden",
});
const headerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  padding: "2",
  borderBottomWidth: "thin",
  borderColor: "neutral.bd.subtle",
  flexShrink: 0,
});
const ownerStyle = css({ minWidth: "[0]", flex: "[1]", overflow: "hidden" });
const ownerKindStyle = css({
  fontSize: "[10px]",
  fontWeight: "medium",
  color: "neutral.fg.subtle",
  paddingLeft: "2",
});
const ownerButtonStyle = css({
  "&&": { maxWidth: "full", justifyContent: "flex-start" },
  "& span": {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});
const tabsStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  paddingX: "3",
  paddingY: "2",
  borderBottomWidth: "thin",
  borderColor: "neutral.bd.subtle",
  overflowX: "auto",
  flexShrink: 0,
});
const editorStyle = css({
  flex: "[1]",
  minHeight: "[0]",
  display: "flex",
  flexDirection: "column",
  "& > div": { borderRadius: "[0]", border: "[0]" },
});
const footerStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
  paddingX: "3",
  paddingY: "2",
  color: "neutral.fg.subtle",
  fontSize: "xs",
  borderTopWidth: "thin",
  borderColor: "neutral.bd.subtle",
  flexShrink: 0,
});
const statusStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  minWidth: "[0]",
});

export const CodeWorkspaceSurface = ({
  entry,
  entries,
  onOpen,
  onClose,
  retainModel,
  placements,
}: {
  entry: CodeEntry;
  entries: CodeEntry[];
  onOpen: (path: string, placement?: CodeEditorPlacement) => void;
  onClose: () => void;
  retainModel: (model: editor.ITextModel | null) => void;
  placements: { value: CodeEditorPlacement; label: string }[];
}) => {
  const { codeEditorPlacement, setCodeEditorPlacement } =
    use(UserSettingsContext);
  const {
    isLeftSidebarOpen,
    leftSidebarWidth,
    propertiesPanelWidth,
    setPropertiesPanelWidth,
  } = use(EditorContext);
  const isReadOnly = useIsReadOnly();
  const [dockHeight, setDockHeight] = useState(360);
  const [position, setPosition] = useState({ lineNumber: 1, column: 1 });
  const siblings = entries.filter(
    (candidate) => candidate.selection.id === entry.selection.id,
  );
  const placement = placements.find(
    (candidate) => candidate.value === codeEditorPlacement,
  ) ?? { value: "fullscreen", label: "Full screen" };

  const sideWidth = Math.max(360, propertiesPanelWidth);
  const left = isLeftSidebarOpen ? leftSidebarWidth : 0;
  const panel = placement.value === "properties";
  const dock = placement.value === "bottom";

  return (
    <GlassPanel
      className={surfaceStyle}
      contentClassName={contentStyle}
      style={{
        left: panel ? undefined : left,
        width: panel ? `min(${sideWidth}px, 100%)` : undefined,
        top: dock ? "auto" : 0,
        height: dock ? `min(${dockHeight}px, 65%)` : undefined,
        maxWidth: "100%",
      }}
      resizable={
        panel
          ? {
              edge: "left",
              size: sideWidth,
              onResize: setPropertiesPanelWidth,
              minSize: 360,
              maxSize: 900,
            }
          : dock
            ? {
                edge: "top",
                size: dockHeight,
                onResize: setDockHeight,
                minSize: 200,
                maxSize: 700,
              }
            : undefined
      }
    >
      <section
        className={contentStyle}
        aria-label={`${entry.owner} code editor`}
        data-code-placement={placement.value}
      >
        <header className={headerStyle}>
          <Button
            size="xs"
            variant="ghost"
            iconName="arrowLeft"
            aria-label="Back to properties"
            tooltip="Back to properties"
            onClick={onClose}
          />
          <div className={ownerStyle}>
            <div className={ownerKindStyle}>{entry.ownerKind}</div>
            <Menu
              trigger={
                <Button
                  size="sm"
                  variant="ghost"
                  iconName="code"
                  className={ownerButtonStyle}
                >
                  {entry.owner}
                  <Icon name="chevronDown" size="xs" />
                </Button>
              }
              items={entries.map((candidate) => ({
                id: candidate.path,
                text: `${candidate.owner} / ${candidate.label}`,
                onClick: () => onOpen(candidate.path),
              }))}
            />
          </div>
          <Menu
            trigger={
              <Button
                size="xs"
                variant="ghost"
                iconName={panel ? "sidebar" : dock ? "bars" : "expand"}
                aria-label="Code editor layout"
                tooltip={`Layout: ${placement.label}`}
              />
            }
            items={placements.map((candidate) => ({
              id: candidate.value,
              text: candidate.label,
              onClick: () => setCodeEditorPlacement(candidate.value),
            }))}
          />
          <Button
            size="xs"
            variant="ghost"
            iconName="close"
            aria-label="Close code editor"
            tooltip="Close code editor"
            onClick={onClose}
          />
        </header>
        <nav className={tabsStyle} aria-label="Code functions">
          {siblings.map((sibling) => (
            <Button
              key={sibling.path}
              size="xs"
              variant={entry.path === sibling.path ? "subtle" : "ghost"}
              aria-pressed={entry.path === sibling.path}
              onClick={() => onOpen(sibling.path)}
            >
              {sibling.label}
            </Button>
          ))}
        </nav>
        <div className={editorStyle}>
          <CodeEditor
            path={entry.path}
            language="typescript"
            value={entry.value}
            height="100%"
            keepCurrentModel
            onChange={(value) => {
              if (value !== undefined && !isReadOnly) entry.update(value);
            }}
            options={{
              readOnly: isReadOnly,
              lineNumbers: "on",
              wordWrap: "on",
              minimap: { enabled: !panel },
              automaticLayout: true,
              fontSize: 13,
              padding: { top: 16, bottom: 16 },
              ariaLabel: `${entry.owner}: ${entry.label}`,
            }}
            onMount={(mountedEditor) => {
              setPosition(
                mountedEditor.getPosition() ?? { lineNumber: 1, column: 1 },
              );
              retainModel(mountedEditor.getModel());
              mountedEditor.onDidChangeModel(() => {
                retainModel(mountedEditor.getModel());
                setPosition(
                  mountedEditor.getPosition() ?? { lineNumber: 1, column: 1 },
                );
              });
              mountedEditor.onDidChangeCursorPosition((event) =>
                setPosition(event.position),
              );
              mountedEditor.focus();
            }}
          />
        </div>
        <footer className={footerStyle}>
          <span
            className={statusStyle}
            title={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
          >
            <Icon name={isReadOnly ? "lockClosed" : "check"} size="xs" />
            {isReadOnly ? "Read only" : "Changes apply automatically"}
          </span>
          <span>
            Ln {position.lineNumber}, Col {position.column}
          </span>
        </footer>
      </section>
    </GlassPanel>
  );
};
