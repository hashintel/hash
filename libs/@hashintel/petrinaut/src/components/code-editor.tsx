import { Tooltip as ArkTooltip } from "@ark-ui/react/tooltip";
import { css, cva } from "@hashintel/ds-helpers/css";
import type { EditorProps, Monaco } from "@monaco-editor/react";
import MonacoEditor from "@monaco-editor/react";
import type { editor, IDisposable } from "monaco-editor";
import { useCallback, useEffect, useRef, useState } from "react";

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
  const [isHovering, setIsHovering] = useState(false);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const editAttemptListenerRef = useRef<IDisposable | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  // Register/unregister edit attempt listener when isReadOnly changes
  useEffect(() => {
    // Dispose previous listener if exists
    if (editAttemptListenerRef.current) {
      editAttemptListenerRef.current.dispose();
      editAttemptListenerRef.current = null;
    }

    // Register new listener if in read-only mode with tooltip
    if (isReadOnly && tooltip && editorRef.current) {
      editAttemptListenerRef.current =
        editorRef.current.onDidAttemptReadOnlyEdit(() => {
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

    return () => {
      if (editAttemptListenerRef.current) {
        editAttemptListenerRef.current.dispose();
        editAttemptListenerRef.current = null;
      }
    };
  }, [isReadOnly, tooltip]);

  const handleMount = useCallback(
    (editorInstance: editor.IStandaloneCodeEditor, monaco: Monaco) => {
      editorRef.current = editorInstance;

      // Register listener if already in read-only mode
      if (isReadOnly && tooltip) {
        editAttemptListenerRef.current =
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

  const editorElement = (
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

  // In read-only mode with tooltip, show on hover OR on edit attempt
  if (isReadOnly && tooltip) {
    const isTooltipOpen = isHovering || showReadOnlyTooltip;

    return (
      <ArkTooltip.Root
        open={isTooltipOpen}
        openDelay={200}
        closeDelay={0}
        positioning={{ placement: "top" }}
      >
        <ArkTooltip.Trigger asChild>
          <div
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
          >
            {editorElement}
          </div>
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
    return <Tooltip content={tooltip}>{editorElement}</Tooltip>;
  }

  return editorElement;
};
