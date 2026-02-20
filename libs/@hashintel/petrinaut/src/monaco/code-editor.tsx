import { css, cva } from "@hashintel/ds-helpers/css";
import type { EditorProps, Monaco } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { Suspense, use, useCallback, useRef } from "react";

import { Tooltip } from "../components/tooltip";
import { MonacoContext } from "./context";

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

const loadingStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "2",
  height: "full",
  color: "fg.muted",
  bg: "bg.subtle",
  fontSize: "base",
});

type CodeEditorProps = Omit<EditorProps, "theme"> & {
  tooltip?: string;
};

const CodeEditorInner: React.FC<CodeEditorProps> = ({
  options,
  onMount,
  ...props
}) => {
  const { Editor } = use(use(MonacoContext));

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  const handleMount = useCallback(
    (editorInstance: editor.IStandaloneCodeEditor, monacoInstance: Monaco) => {
      editorRef.current = editorInstance;
      onMount?.(editorInstance, monacoInstance);
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

  return (
    <Editor
      theme="vs-light"
      height="100%"
      options={editorOptions}
      onMount={handleMount}
      {...props}
    />
  );
};

export const CodeEditor: React.FC<CodeEditorProps> = ({
  tooltip,
  options,
  height,
  ...props
}) => {
  const isReadOnly = options?.readOnly === true;

  const editorElement = (
    <div className={containerStyle({ isReadOnly })} style={{ height }}>
      <Suspense
        fallback={<div className={loadingStyle}>Loading editor...</div>}
      >
        <CodeEditorInner options={options} height={height} {...props} />
      </Suspense>
    </div>
  );

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
