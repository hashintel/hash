import { Tooltip as ArkTooltip } from "@ark-ui/react/tooltip";
import { css, cva } from "@hashintel/ds-helpers/css";
import type { EditorProps, Monaco } from "@monaco-editor/react";
import MonacoEditor from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { useCallback, useRef, useState } from "react";

import { Tooltip } from "./tooltip";

const containerStyle = cva({
  base: {
    position: "relative",
    border: "[1px solid rgba(0, 0, 0, 0.1)]",
    borderRadius: "[4px]",
    overflow: "hidden",
  },
  variants: {
    isReadOnly: {
      true: {
        filter: "[grayscale(20%) brightness(98%)]",
        cursor: "not-allowed",
      },
      false: {},
    },
  },
});

const tooltipContentStyle = css({
  backgroundColor: "gray.90",
  color: "gray.10",
  borderRadius: "md.6",
  fontSize: "[13px]",
  zIndex: "[10000]",
  boxShadow: "[0 2px 8px rgba(0, 0, 0, 0.15)]",
  padding: "[6px 10px]",
});

type CodeEditorProps = Omit<EditorProps, "theme"> & {
  tooltip?: string;
};

/**
 * Code editor component that wraps Monaco Editor.
 *
 * @param tooltip - Optional tooltip to show when hovering over the editor.
 *                  In read-only mode, the tooltip also appears when attempting to edit.
 */
export const CodeEditor: React.FC<CodeEditorProps> = ({
  tooltip,
  options,
  height,
  onMount,
  ...props
}) => {
  const isReadOnly = options?.readOnly === true;
  const [showReadOnlyTooltip, setShowReadOnlyTooltip] = useState(false);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMount = useCallback(
    (editorInstance: editor.IStandaloneCodeEditor, monaco: Monaco) => {
      if (isReadOnly && tooltip) {
        editorInstance.onDidAttemptReadOnlyEdit(() => {
          // Clear any existing timeout
          if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current);
          }

          // Show tooltip
          setShowReadOnlyTooltip(true);

          // Hide after 2 seconds
          hideTimeoutRef.current = setTimeout(() => {
            setShowReadOnlyTooltip(false);
          }, 2000);
        });
      }

      // Call the original onMount if provided
      onMount?.(editorInstance, monaco);
    },
    [isReadOnly, tooltip, onMount],
  );

  const editorOptions: EditorProps["options"] = {
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    fontSize: 12,
    lineNumbers: "off",
    folding: true,
    glyphMargin: false,
    lineDecorationsWidth: 0,
    lineNumbersMinChars: 3,
    padding: { top: 8, bottom: 8 },
    fixedOverflowWidgets: true,
    ...options,
  };

  const editor = (
    <div className={containerStyle({ isReadOnly })} style={{ height }}>
      <MonacoEditor
        theme="vs-light"
        height="100%"
        options={editorOptions}
        onMount={handleMount}
        {...props}
      />
    </div>
  );

  // In read-only mode with tooltip, use controlled tooltip that shows on edit attempts
  if (isReadOnly && tooltip) {
    return (
      <ArkTooltip.Root
        open={showReadOnlyTooltip}
        openDelay={200}
        closeDelay={0}
        positioning={{ placement: "top" }}
      >
        <ArkTooltip.Trigger asChild>
          <div>{editor}</div>
        </ArkTooltip.Trigger>
        <ArkTooltip.Positioner>
          <ArkTooltip.Content className={tooltipContentStyle}>
            {tooltip}
          </ArkTooltip.Content>
        </ArkTooltip.Positioner>
      </ArkTooltip.Root>
    );
  }

  // Regular tooltip for non-read-only mode (if tooltip is provided)
  if (tooltip) {
    return <Tooltip content={tooltip}>{editor}</Tooltip>;
  }

  return editor;
};
