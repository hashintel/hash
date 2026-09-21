import {
  Suspense,
  use,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { Tooltip } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import { CODE_FONT_FAMILY } from "../constants/ui";
import { MonacoContext } from "./context";

import type { EditorProps, Monaco } from "@monaco-editor/react";
import type { editor } from "monaco-editor";

// -- Single-line constants ----------------------------------------------------

const SINGLE_LINE_HEIGHT = 16;
const SINGLE_LINE_PADDING_Y = 6;
const SINGLE_LINE_TOTAL_HEIGHT = SINGLE_LINE_HEIGHT + SINGLE_LINE_PADDING_Y * 2;

// -- Styles -------------------------------------------------------------------

const multiLineContainerStyle = cva({
  base: {
    position: "relative",
    borderWidth: "[1px]",
    borderStyle: "solid",
    borderColor: "neutral.bd.subtle",
    borderRadius: "lg",
    overflow: "hidden",
    marginInline: "0",
    "[data-subview-full-width-code] &": {
      borderColor: "[transparent]",
      borderRadius: "[0]",
      marginInline: "[calc(-1 * var(--subview-content-inline-padding, 0px))]",
      boxShadow: "[none]",
    },
    "[data-subview-animate] &": {
      transition:
        "[border-color 240ms cubic-bezier(0.22, 1, 0.36, 1), border-radius 240ms cubic-bezier(0.22, 1, 0.36, 1), margin-inline 240ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 240ms cubic-bezier(0.22, 1, 0.36, 1)]",
      "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
    },
    _focusWithin: {
      boxShadow: "[0px 0px 0px 2px {colors.neutral.a25}]",
    },
  },
  variants: {
    hasError: {
      true: {
        borderColor: "red.s90",
        _focusWithin: {
          boxShadow: "[0px 0px 0px 2px {colors.red.a25}]",
        },
      },
    },
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
    // Literal: Panda's extractor cannot resolve interpolated constants.
    height: "[28px]",
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
    frameless: {
      true: {
        borderColor: "[transparent]",
        borderRadius: "[0]",
        _hover: { borderColor: "[transparent]" },
        _focusWithin: {
          borderColor: "[transparent]",
          boxShadow: "[none]",
        },
      },
    },
  },
});

// The wait for Monaco, shown twice: as the Suspense fallback while the
// module loads and as Monaco's own `loading` while the editor mounts.
// Dimmed, so it reads as a wait and not as content; it fills its box
// because Monaco centres whatever it is given.
const loadingStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "2",
  height: "full",
  width: "full",
  color: "fg.muted",
  bg: "bg.subtle",
  fontSize: "base",
  opacity: "[0.3]",
});

// Inline editors left-align the label where the text will land, so it does
// not jump from the centre when the editor mounts.
const singleLineLoadingStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-start",
  height: "full",
  width: "full",
  paddingLeft: "[12px]",
  color: "neutral.s80",
  fontSize: "sm",
  opacity: "[0.3]",
});

const placeholderStyle = css({
  position: "absolute",
  top: "[6px]",
  left: "[12px]",
  fontSize: "xs",
  fontFamily: "['JetBrains Mono Variable', monospace]",
  color: "neutral.s80",
  pointerEvents: "none",
  zIndex: "[1]",
  lineHeight: "[16px]",
});

// -- Props --------------------------------------------------------------------

export type CodeEditorProps = Omit<EditorProps, "theme"> & {
  tooltip?: string;
  /** Render as a single-line expression input */
  singleLine?: boolean;
  /** Placeholder text shown while the editor is empty. */
  placeholder?: string;
  /** Called when Enter is pressed (only used in singleLine mode) */
  onSubmit?: () => void;
  /** Leave the editor on Escape after dismissing any completion popup. */
  onEscape?: () => void;
  /** Called when the editor gains focus */
  onEditorFocus?: () => void;
  /** Called when the editor loses focus */
  onEditorBlur?: () => void;
  /** Show error styling (red border) */
  hasError?: boolean;
  /**
   * Drop the single-line container's own border, radius, and focus ring, for
   * hosts that draw the frame themselves (the ad-hoc form's editor slab).
   */
  frameless?: boolean;
  /**
   * Where the caret lands on mount: "end" puts it after the content (typing
   * continues), "all" selects the whole content (typing replaces). Omitted,
   * the caret is only positioned when the reused per-path model needed a
   * value sync (the pre-existing behaviour).
   */
  mountSelection?: "all" | "end";
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
  onEscape,
  value,
  onChange,
  mountSelection,
  ...props
}) => {
  const { Editor } = use(use(MonacoContext));
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  // While the editor has focus its model is the source of truth: the wrapper
  // must not echo the (possibly one-keystroke-stale) controlled value back
  // into the model mid-typing — that reset teleports the cursor to the end.
  // Withholding `value` makes @monaco-editor/react skip its sync; the prop
  // resumes syncing external changes once focus leaves.
  const [editorFocused, setEditorFocused] = useState(false);
  // Until Monaco mounts, its `loading` label sits where the placeholder
  // would, so the placeholder waits for the mount rather than overlapping it.
  const [editorMounted, setEditorMounted] = useState(false);

  useEffect(() => {
    if (!onEscape) {
      return;
    }
    // Drawer dismissal listens at document capture; handle editor Escape first.
    const handleEscape = (event: KeyboardEvent) => {
      const instance = editorRef.current;
      const editorNode = instance?.getDomNode();
      if (
        event.key !== "Escape" ||
        !instance ||
        !(event.target instanceof Node) ||
        !editorNode?.contains(event.target)
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (
        editorNode.querySelector(
          ".suggest-widget.visible, .parameter-hints-widget.visible",
        )
      ) {
        instance.trigger("keyboard", "hideSuggestWidget", {});
        instance.trigger("keyboard", "closeParameterHints", {});
      } else {
        onEscape();
      }
    };
    window.addEventListener("keydown", handleEscape, true);
    return () => window.removeEventListener("keydown", handleEscape, true);
  }, [onEscape]);

  const handleMount = (
    editorInstance: editor.IStandaloneCodeEditor,
    monacoInstance: Monaco,
  ) => {
    editorRef.current = editorInstance;
    setEditorFocused(false);
    setEditorMounted(true);

    // With a `path`, @monaco-editor/react reuses the existing model and
    // ignores `value` — a reopened editor would show the model's stale text
    // instead of the committed (possibly re-formatted) value. Sync once on
    // mount; while focused the model stays authoritative (see below).
    const mountedModel = editorInstance.getModel();
    const synced =
      value !== undefined &&
      mountedModel !== null &&
      mountedModel.getValue() !== value;
    if (synced) {
      mountedModel.setValue(value);
    }
    // A fresh model mounts with the caret at the start; a reused one keeps
    // its stale position. `mountSelection` makes the landing explicit —
    // otherwise a synced model still gets the caret moved to the end so a
    // type-to-overwrite character keeps typing where it left off.
    if (mountedModel && (mountSelection !== undefined || synced)) {
      if (mountSelection === "all") {
        editorInstance.setSelection(mountedModel.getFullModelRange());
      } else {
        const lastLine = mountedModel.getLineCount();
        editorInstance.setPosition({
          lineNumber: lastLine,
          column: mountedModel.getLineMaxColumn(lastLine),
        });
      }
    }

    if (singleLine) {
      // Reactively strip newlines — this handles Enter key, paste, and any
      // other source of newlines without blocking Enter from being used by
      // the suggest widget to accept completions. Removed, not replaced
      // with spaces: Enter-to-validate must not edit the text under the
      // cursor.
      editorInstance.onDidChangeModelContent(() => {
        const model = editorInstance.getModel();
        if (model && model.getLineCount() > 1) {
          const fullText = model.getValue();
          const flat = fullText.replace(/[\n\r]/g, "");
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

    editorInstance.onDidFocusEditorText(() => {
      setEditorFocused(true);
      onEditorFocus?.();
    });
    editorInstance.onDidBlurEditorText(() => {
      setEditorFocused(false);
      onEditorBlur?.();
    });

    onMount?.(editorInstance, monacoInstance);
  };

  // Monaco retains its first onMount callback across Activity reactivation.
  // Read the current committed props when it recreates the native editor.
  const handleMountRef = useRef(handleMount);
  useLayoutEffect(() => {
    handleMountRef.current = handleMount;
  });

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
        // The textarea input path: EditContext lets macOS smart punctuation
        // rewrite code (double-space becomes a period).
        editContext: false,
        ...options,
        tabFocusMode: true,
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
        editContext: false,
        ...options,
      };

  return (
    <>
      {placeholder && !value && editorMounted && (
        <div className={placeholderStyle}>{placeholder}</div>
      )}
      <Editor
        theme="petrinaut-light"
        height={singleLine ? SINGLE_LINE_TOTAL_HEIGHT : "100%"}
        options={editorOptions}
        onMount={(editorInstance, monacoInstance) =>
          handleMountRef.current(editorInstance, monacoInstance)
        }
        value={editorFocused ? undefined : value}
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
  frameless = false,
  ...props
}) => {
  const isReadOnly = options?.readOnly === true;

  const containerClass = singleLine
    ? singleLineContainerStyle({ isReadOnly, hasError, frameless })
    : multiLineContainerStyle({ isReadOnly, hasError });

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
          loading={fallback}
          {...props}
        />
      </Suspense>
    </div>
  );

  if (tooltip) {
    return (
      <Tooltip
        content={tooltip}
        className={css({ flex: "1", display: "block" })}
      >
        {editorElement}
      </Tooltip>
    );
  }

  return editorElement;
};
