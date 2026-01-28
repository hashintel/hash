import { css, cva } from "@hashintel/ds-helpers/css";
import type { EditorProps, Monaco } from "@monaco-editor/react";
import MonacoEditor from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { useCallback, useRef } from "react";

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
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  const handleMount = useCallback(
    (editorInstance: editor.IStandaloneCodeEditor, monaco: Monaco) => {
      editorRef.current = editorInstance;
      // Call the original onMount if provided
      onMount?.(editorInstance, monaco);
    },
    [onMount],
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

  // Regular tooltip for non-read-only mode (if tooltip is provided)
  if (tooltip) {
    return (
      <Tooltip
        content={tooltip}
        display="block"
        className={css({
          flex: "1",
        })}
      >
        {editorElement}
      </Tooltip>
    );
  }

  return editorElement;
};
