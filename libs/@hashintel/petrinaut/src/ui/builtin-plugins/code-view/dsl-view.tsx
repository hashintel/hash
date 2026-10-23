import { useEffect, useState } from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { CodeEditor } from "../../monaco/code-editor";
import { dslLanguageId, registerDslLanguage } from "./dsl-language";

import type { DslSpan } from "@hashintel/petrinaut-core";
import type { editor } from "monaco-editor";

const containerStyle = css({
  display: "flex",
  flexDirection: "column",
  flex: "[1]",
  minHeight: "[0]",
  minWidth: "[0]",
  backgroundColor: "neutral.s00",
});

const toolbarStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  flexShrink: "0",
  paddingX: "3",
  paddingY: "2",
  borderBottomWidth: "[1px]",
  borderBottomStyle: "solid",
  borderBottomColor: "neutral.s30",
  fontSize: "sm",
  color: "neutral.s100",
});

const toolbarSpaceStyle = css({
  width: "[var(--edit-view-selector-width)]",
  flexShrink: "0",
});

const toolbarHintStyle = css({
  flex: "[1]",
  minWidth: "[0]",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const editorStyle = css({
  flex: "[1]",
  minHeight: "[0]",
  "& > div": { height: "full", border: "none", borderRadius: "[0]" },
});

/** The lines of the entity the editor's selection names. */
export type RevealedLines = { startLine: number; endLine: number } | null;

/**
 * The net as DSL text in a read-only Monaco editor. The lines of the selected
 * entity are highlighted and scrolled into view.
 */
export const DslView = ({
  text,
  revealed,
}: {
  text: string;
  spans: readonly DslSpan[];
  revealed: RevealedLines;
}) => {
  const [editorInstance, setEditorInstance] =
    useState<editor.IStandaloneCodeEditor | null>(null);
  const [copied, setCopied] = useState(false);

  // Monaco is imperative: the highlight and the scroll are applied to the
  // editor instance whenever the selection's lines change.
  useEffect(() => {
    if (editorInstance === null || revealed === null) {
      return;
    }
    const decorations = editorInstance.createDecorationsCollection([
      {
        range: {
          startLineNumber: revealed.startLine,
          startColumn: 1,
          endLineNumber: revealed.endLine,
          endColumn: 1,
        },
        options: {
          isWholeLine: true,
          className: "petrinaut-dsl-selected-line",
          linesDecorationsClassName: "petrinaut-dsl-selected-gutter",
        },
      },
    ]);
    editorInstance.revealLinesInCenterIfOutsideViewport(
      revealed.startLine,
      revealed.endLine,
    );
    return () => decorations.clear();
  }, [editorInstance, revealed]);

  return (
    <div className={containerStyle}>
      <div className={toolbarStyle}>
        <div aria-hidden className={toolbarSpaceStyle} />
        <span className={toolbarHintStyle}>
          Read-only projection of the net as Petrinaut DSL. Edit on Canvas or in
          Definitions; select an item to find it here.
        </span>
        <Button
          size="xs"
          variant="ghost"
          iconName={copied ? "check" : "copy"}
          onClick={() => {
            void navigator.clipboard.writeText(text).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <div className={editorStyle}>
        <style>{`
          .petrinaut-dsl-selected-line { background: rgba(59, 130, 246, 0.10); }
          .petrinaut-dsl-selected-gutter { background: rgba(59, 130, 246, 0.6); width: 3px !important; margin-left: 3px; }
        `}</style>
        <CodeEditor
          language={dslLanguageId}
          value={text}
          height="100%"
          beforeMount={registerDslLanguage}
          onMount={(instance) => setEditorInstance(instance)}
          options={{
            readOnly: true,
            domReadOnly: true,
            lineNumbers: "on",
            lineNumbersMinChars: 3,
            folding: true,
            renderLineHighlight: "none",
            wordWrap: "on",
          }}
        />
      </div>
    </div>
  );
};
