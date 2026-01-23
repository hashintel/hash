import { css, cva } from "@hashintel/ds-helpers/css";
import type { EditorProps } from "@monaco-editor/react";
import MonacoEditor from "@monaco-editor/react";

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
 *                  When provided, the editor becomes non-interactive (for read-only mode explanations).
 */
export const CodeEditor: React.FC<CodeEditorProps> = ({
  tooltip,
  options,
  height,
  ...props
}) => {
  const isReadOnly = options?.readOnly === true;

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
        {...props}
      />
    </div>
  );

  if (tooltip) {
    return <Tooltip content={tooltip}>{editor}</Tooltip>;
  }

  return editor;
};
