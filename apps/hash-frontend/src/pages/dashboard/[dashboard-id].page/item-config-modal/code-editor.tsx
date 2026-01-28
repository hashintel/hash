// disabled simple-import-sort, because `Prism` needs to imported first here, otherwise it throws an error
// eslint-disable-next-line simple-import-sort/imports
import Prism from "prismjs";
import "prismjs/components/prism-json";
import "prismjs/components/prism-json5";
import "prismjs/components/prism-python";

import { Box, GlobalStyles } from "@mui/material";
import type { ChangeEvent, KeyboardEvent } from "react";
import { useCallback, useEffect, useRef } from "react";

export type CodeLanguage = "json" | "python";

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  height: string | number;
  language: CodeLanguage;
  readOnly?: boolean;
}

export const CodeEditor = ({
  value,
  onChange,
  height,
  language,
  readOnly = false,
}: CodeEditorProps) => {
  const highlightedElementRef = useRef<HTMLPreElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!highlightedElementRef.current) {
      return;
    }

    Prism.highlightElement(highlightedElementRef.current.children[0]!);
  }, [value, language]);

  /**
   * This ensures the code block scrolls with
   * the textarea
   */
  const handleTextAreaScroll = useCallback(() => {
    if (!highlightedElementRef.current || !textAreaRef.current) {
      return;
    }

    highlightedElementRef.current.scrollLeft = textAreaRef.current.scrollLeft;
    highlightedElementRef.current.scrollTop = textAreaRef.current.scrollTop;
  }, []);

  const handleKeyDown = useCallback(
    (evt: KeyboardEvent<HTMLTextAreaElement>) => {
      if (!textAreaRef.current || readOnly) {
        return;
      }

      evt.stopPropagation();

      if (evt.key === "Tab") {
        evt.preventDefault();

        const { selectionStart } = evt.currentTarget;
        let newCursorPos;
        let newText;

        if (evt.shiftKey) {
          // The previous character has to be a tab
          if (value.substring(selectionStart - 1, selectionStart) !== "\t") {
            return;
          }

          newText = `${value.substring(0, selectionStart - 1)}${value.substring(
            selectionStart,
          )}`;

          newCursorPos = selectionStart - 1;
        } else {
          newText = `${value.substring(0, selectionStart)}\t${value.substring(
            selectionStart,
          )}`;
          newCursorPos = selectionStart + 1;
        }

        onChange(newText);

        // Once state is updated, the cursor is pushed to the end of the string, which isn't ideal
        // if the indentation is made before the end of the string.
        // Doing this helps to preserve the cursor location.
        textAreaRef.current.value = newText;
        textAreaRef.current.selectionStart = newCursorPos;
        textAreaRef.current.selectionEnd = newCursorPos;
      }
    },
    [value, onChange, readOnly],
  );

  const handleChange = useCallback(
    (evt: ChangeEvent<HTMLTextAreaElement>) => {
      if (!readOnly) {
        onChange(evt.target.value);
      }
    },
    [onChange, readOnly],
  );

  return (
    <Box
      sx={(theme) => ({
        height,
        position: "relative",
        fontSize: 14,
        backgroundColor: theme.palette.gray[90],
        borderRadius: 1,
        overflow: "hidden",
      })}
    >
      <pre
        style={{
          borderRadius: 0,
          outline: "none",
          height: "100%",
          background: "transparent",
          padding: "16px",
          margin: "0",
          overflow: "auto",
        }}
        ref={highlightedElementRef}
      >
        <code style={{ tabSize: 2 }} className={`language-${language}`}>
          {value || " "}
        </code>
      </pre>
      <Box
        sx={(theme) => ({
          position: "absolute",
          inset: 0,
          border: "none",
          /**
           * firefox does not work with inset:0 to adjust the width of `textarea` element width `position: absolute`
           * and we cannot use `100%` as `width`, because that does not respect to horizontal margin
           * `-moz-available` works as expected on firefox
           */
          width: "-moz-available",
          height: "100%",
          padding: "16px",
          margin: "0",
          resize: "none",
          // to override focus outline on firefox
          outline: "none !important",
          caretColor: theme.palette.common.white,
          background: "transparent",
          color: "transparent",
          lineHeight: 1.5,
          tabSize: 2,
          fontFamily: `Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace`,
          fontSize: "1em",
          cursor: readOnly ? "default" : "text",
        })}
        autoFocus={!readOnly}
        wrap="off"
        component="textarea"
        ref={textAreaRef}
        onChange={handleChange}
        value={value}
        onKeyDown={handleKeyDown}
        onScroll={handleTextAreaScroll}
        spellCheck="false"
        readOnly={readOnly}
      />
      <GlobalStyles
        styles={`
          code[class*="language-"],
          pre[class*="language-"] {
            color: #f8f8f2;
            background: none;
            text-shadow: 0 1px rgba(0, 0, 0, 0.3);
            font-family: Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace;
            font-size: 1em;
            text-align: left;
            white-space: pre;
            word-spacing: normal;
            word-break: normal;
            word-wrap: normal;
            line-height: 1.5;

            -moz-tab-size: 4;
            -o-tab-size: 4;
            tab-size: 4;

            -webkit-hyphens: none;
            -moz-hyphens: none;
            -ms-hyphens: none;
            hyphens: none;
          }

          /* Code blocks */
          pre[class*="language-"] {
            margin: 0;
            overflow: auto;
            border-radius: 0.3em;
          }

          .token.comment,
          .token.prolog,
          .token.doctype,
          .token.cdata {
            color: #8292a2;
          }

          .token.punctuation {
            color: #f8f8f2;
          }

          .token.namespace {
            opacity: 0.7;
          }

          .token.property,
          .token.tag,
          .token.constant,
          .token.symbol,
          .token.deleted {
            color: #b0a2ff;
          }

          .token.boolean,
          .token.number {
            color: #ae81ff;
          }

          .token.selector,
          .token.attr-name,
          .token.string,
          .token.char,
          .token.builtin,
          .token.inserted {
            color: #35c9eb;
          }

          .token.operator,
          .token.entity,
          .token.url,
          .language-css .token.string,
          .style .token.string,
          .token.variable {
            color: #c4c1c9;
          }

          .token.atrule,
          .token.attr-value,
          .token.function,
          .token.class-name {
            color: #e6db74;
          }

          .token.keyword {
            color: #66d9ef;
          }

          .token.regex,
          .token.important {
            color: #f58c4b;
          }

          .token.important,
          .token.bold {
            font-weight: bold;
          }
          .token.italic {
            font-style: italic;
          }

          .token.entity {
            cursor: help;
          }
        `}
      />
    </Box>
  );
};
