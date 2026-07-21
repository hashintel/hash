import { json, jsonParseLinter } from "@codemirror/lang-json";
import { python } from "@codemirror/lang-python";
import { linter, lintGutter } from "@codemirror/lint";
import { Box } from "@mui/material";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { useMemo } from "react";

export type CodeLanguage = "json" | "python";

type CodeEditorProps = {
  value: string;
  onChange?: (value: string) => void;
  height: string | number;
  language: CodeLanguage;
  readOnly?: boolean;
};

/**
 * Shared CodeMirror 6 editor for JSON and Python, themed to match the app's
 * dark code blocks. JSON documents are linted inline as the user types.
 */
export const CodeEditor = ({
  value,
  onChange,
  height,
  language,
  readOnly = false,
}: CodeEditorProps) => {
  const extensions = useMemo(() => {
    const editorTheme = EditorView.theme(
      {
        "&": {
          fontSize: "13px",
          height: "100%",
        },
        ".cm-content": {
          fontFamily: `Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace`,
        },
        ".cm-gutters": {
          border: "none",
        },
        "&.cm-focused": {
          outline: "none",
        },
      },
      { dark: true },
    );

    if (language === "json") {
      // An empty document isn't an error – it just means "not configured yet"
      const jsonLinter = linter((view) =>
        view.state.doc.toString().trim() === "" ? [] : jsonParseLinter()(view),
      );
      return [json(), jsonLinter, lintGutter(), editorTheme];
    }
    return [python(), editorTheme];
  }, [language]);

  return (
    <Box
      sx={({ palette }) => ({
        height,
        borderRadius: 1,
        overflow: "hidden",
        border: `1px solid ${palette.gray[30]}`,
        // react-codemirror inserts a wrapper div (.cm-theme) with auto
        // height, which would otherwise collapse the 100% height chain
        "& > div": { height: "100%" },
        "& .cm-editor": { height: "100%" },
      })}
    >
      <CodeMirror
        value={value}
        onChange={onChange}
        height={typeof height === "number" ? `${height}px` : height}
        theme="dark"
        readOnly={readOnly}
        editable={!readOnly}
        extensions={extensions}
        basicSetup={{
          lineNumbers: true,
          bracketMatching: true,
          closeBrackets: true,
          foldGutter: true,
          highlightActiveLine: !readOnly,
          highlightActiveLineGutter: !readOnly,
          indentOnInput: true,
          autocompletion: false,
        }}
      />
    </Box>
  );
};
