import { css, cva } from "@hashintel/ds-helpers/css";
import type { EditorProps, Monaco } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { Suspense, use, useRef } from "react";

import { Tooltip } from "../components/tooltip";
import { CODE_FONT_FAMILY } from "../constants/ui";
import { MonacoContext } from "./context";

// -- Single-line constants ----------------------------------------------------

const SINGLE_LINE_HEIGHT = 18;
const SINGLE_LINE_PADDING_Y = 6;
const SINGLE_LINE_TOTAL_HEIGHT = SINGLE_LINE_HEIGHT + SINGLE_LINE_PADDING_Y * 2;

// -- Styles -------------------------------------------------------------------

const multiLineContainerStyle = cva({
  base: {
    position: "relative",
    border: "[1px solid rgba(0, 0, 0, 0.1)]",
    borderRadius: "sm",
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

const singleLineContainerStyle = cva({
  base: {
    position: "relative",
    borderWidth: "[1px]",
    borderStyle: "solid",
    borderColor: "neutral.bd.subtle",
    borderRadius: "lg",
    overflow: "hidden",
    height: `[${SINGLE_LINE_TOTAL_HEIGHT}px]`,
    flex: "1",
    minWidth: "[0]",
    transition: "[border-color 0.15s ease, box-shadow 0.15s ease]",
    _hover: {
      borderColor: "neutral.bd.subtle.hover",
    },
    _focusWithin: {
      borderColor: "neutral.bd.subtle",
      boxShadow: "[0px 0px 0px 2px {colors.neutral.a25}]",
    },
  },
  variants: {
    isReadOnly: {
      true: {
        filter: "[grayscale(20%) brightness(98%)]",
        cursor: "not-allowed",
      },
      false: {},
    },
    hasError: {
      true: {
        borderColor: "red.s90",
        _hover: { borderColor: "red.s90" },
        _focusWithin: {
          borderColor: "red.s90",
          boxShadow: "[0px 0px 0px 2px {colors.red.a25}]",
        },
      },
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

const singleLineLoadingStyle = css({
  display: "flex",
  alignItems: "center",
  height: "full",
  paddingX: "2",
  color: "neutral.s80",
  fontSize: "sm",
});

const placeholderStyle = css({
  position: "absolute",
  top: `[${SINGLE_LINE_PADDING_Y}px]`,
  left: "[12px]",
  fontSize: "xs",
  fontFamily: `[${CODE_FONT_FAMILY}]`,
  color: "neutral.s80",
  pointerEvents: "none",
  zIndex: 1,
  lineHeight: `[${SINGLE_LINE_HEIGHT}px]`,
});

// -- Props --------------------------------------------------------------------

export type CodeEditorProps = Omit<EditorProps, "theme"> & {
  tooltip?: string;
  /** Render as a single-line expression input */
  singleLine?: boolean;
  /** Placeholder text (only used in singleLine mode) */
  placeholder?: string;
  /** Called when Enter is pressed (only used in singleLine mode) */
  onSubmit?: () => void;
  /** Called when the editor gains focus */
  onEditorFocus?: () => void;
  /** Called when the editor loses focus */
  onEditorBlur?: () => void;
  /** Show error styling (red border) */
  hasError?: boolean;
};

// -- Inner component ----------------------------------------------------------

const CodeEditorInner: React.FC<CodeEditorProps> = ({
  options,
  onEditorFocus,
  onEditorBlur,
  onMount,
  singleLine = false,
  placeholder,
  onSubmit,
  value,
  onChange,
  ...props
}) => {
  const { Editor } = use(use(MonacoContext));
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  const handleMount = (
    editorInstance: editor.IStandaloneCodeEditor,
    monacoInstance: Monaco,
  ) => {
    editorRef.current = editorInstance;

    if (singleLine) {
      // Reactively strip newlines — this handles Enter key, paste, and any
      // other source of newlines without blocking Enter from being used by
      // the suggest widget to accept completions.
      editorInstance.onDidChangeModelContent(() => {
        const model = editorInstance.getModel();
        if (model && model.getLineCount() > 1) {
          const fullText = model.getValue();
          const flat = fullText.replace(/[\n\r]/g, " ");
          model.setValue(flat);
          const endCol = model.getLineMaxColumn(1);
          editorInstance.setPosition({ lineNumber: 1, column: endCol });
          onSubmit?.();
        }
      });

      // Force vertical scroll to stay at 0 — prevents scrolling when
      // the cursor moves or text is selected past the visible area.
      editorInstance.onDidScrollChange((e) => {
        if (e.scrollTop !== 0) {
          editorInstance.setScrollTop(0);
        }
      });
    }

    if (onEditorFocus) {
      editorInstance.onDidFocusEditorText(() => onEditorFocus());
    }
    if (onEditorBlur) {
      editorInstance.onDidBlurEditorText(() => onEditorBlur());
    }

    onMount?.(editorInstance, monacoInstance);
  };

  const editorOptions: EditorProps["options"] = singleLine
    ? {
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontFamily: CODE_FONT_FAMILY,
        fontSize: 12,
        lineHeight: SINGLE_LINE_HEIGHT,
        lineNumbers: "off",
        folding: false,
        glyphMargin: false,
        lineDecorationsWidth: 8,
        lineNumbersMinChars: 0,
        padding: {
          top: SINGLE_LINE_PADDING_Y,
          bottom: SINGLE_LINE_PADDING_Y,
        },
        fixedOverflowWidgets: true,
        scrollbar: {
          vertical: "hidden",
          horizontal: "hidden",
          handleMouseWheel: false,
          alwaysConsumeMouseWheel: false,
        },
        scrollBeyondLastColumn: 0,
        overviewRulerLanes: 0,
        overviewRulerBorder: false,
        hideCursorInOverviewRuler: true,
        wordWrap: "off",
        renderLineHighlight: "none",
        contextmenu: false,
        suggest: { showStatusBar: false },
        ...options,
      }
    : {
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontFamily: CODE_FONT_FAMILY,
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
    <>
      {singleLine && placeholder && !value && (
        <div className={placeholderStyle}>{placeholder}</div>
      )}
      <Editor
        theme="vs-light"
        height={singleLine ? SINGLE_LINE_TOTAL_HEIGHT : "100%"}
        options={editorOptions}
        onMount={handleMount}
        value={value}
        onChange={onChange}
        {...props}
      />
    </>
  );
};

// -- Outer component ----------------------------------------------------------

export const CodeEditor: React.FC<CodeEditorProps> = ({
  tooltip,
  options,
  height,
  singleLine = false,
  hasError = false,
  ...props
}) => {
  const isReadOnly = options?.readOnly === true;

  const containerClass = singleLine
    ? singleLineContainerStyle({ isReadOnly, hasError })
    : multiLineContainerStyle({ isReadOnly });

  const fallback = singleLine ? (
    <div className={singleLineLoadingStyle}>Loading...</div>
  ) : (
    <div className={loadingStyle}>Loading editor...</div>
  );

  const editorElement = (
    <div className={containerClass} style={singleLine ? undefined : { height }}>
      <Suspense fallback={fallback}>
        <CodeEditorInner
          options={options}
          height={height}
          singleLine={singleLine}
          {...props}
        />
      </Suspense>
    </div>
  );

  if (tooltip) {
    return (
      <Tooltip content={tooltip} display="block" className={css({ flex: "1" })}>
        {editorElement}
      </Tooltip>
    );
  }

  return editorElement;
};
