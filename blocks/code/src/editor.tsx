import Prism from "prismjs";
import type { ChangeEvent, KeyboardEvent, RefObject } from "react";
import { useCallback, useEffect, useRef } from "react";

import styles from "./editor.module.css";
import type { LanguageType } from "./utils";

type IEditorProps = {
  content: string;
  setContent: (content: string) => void;
  language: LanguageType;
  editorRef: RefObject<HTMLTextAreaElement | null>;
  onBlur: () => void;
  readonly: boolean;
};

export const Editor = ({
  content,
  language,
  setContent,
  editorRef,
  onBlur,
  readonly,
}: IEditorProps) => {
  const textAreaRef = editorRef;
  const highlightedElementRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (!highlightedElementRef.current) return;
    Prism.highlightElement(highlightedElementRef.current.children[0]!);
  }, [language, content]);

  /**
   * This ensures the code block scrolls with
   * the textarea
   *
   */
  const syncScroll = useCallback(() => {
    if (!highlightedElementRef.current || !textAreaRef.current) return;

    highlightedElementRef.current.scrollLeft = textAreaRef.current.scrollLeft;
  }, [textAreaRef, highlightedElementRef]);

  /**
   * This helps in updating the height of the textarea especially when a new
   * line is added/removed and updates the height of the code block
   */
  const syncHeight = useCallback(() => {
    const textAreaEl = textAreaRef.current;
    const preEl = highlightedElementRef.current; // <pre> element
    if (!textAreaEl || !preEl) return;

    const hasHorizontalScrollbar =
      textAreaEl.scrollWidth > textAreaEl.clientWidth;
    const additionalHeight = hasHorizontalScrollbar ? 30 : 0;

    textAreaEl.style.height = "auto";
    textAreaEl.style.height = `${textAreaEl.scrollHeight + additionalHeight}px`;
    preEl.style.height = `${textAreaEl.scrollHeight + additionalHeight}px`;
  }, [textAreaRef, highlightedElementRef]);

  useEffect(() => {
    const resizeListener = () => {
      syncHeight();
    };

    window.addEventListener("resize", resizeListener);

    return () => window.removeEventListener("resize", resizeListener);
  });

  useEffect(() => {
    syncHeight();
    syncScroll();
  }, [content, syncScroll, syncHeight]);

  const handleChange = (evt: ChangeEvent<HTMLTextAreaElement>) => {
    setContent(evt.target.value);
  };

  const handleKeyDown = (evt: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!textAreaRef.current) return;

    if (evt.key === "Tab") {
      evt.preventDefault();
      const { selectionStart } = evt.currentTarget;
      let newCursorPos;
      let newContent;

      if (evt.shiftKey) {
        // The previous character has to be a tab
        if (content.substring(selectionStart - 1, selectionStart) !== "\t") {
          return;
        }

        newContent = `${content.substring(
          0,
          selectionStart - 1,
        )}${content.substring(selectionStart)}`;

        newCursorPos = selectionStart - 1;
      } else {
        newContent = `${content.substring(
          0,
          selectionStart,
        )}\t${content.substring(selectionStart)}`;
        newCursorPos = selectionStart + 1;
      }

      setContent(newContent);

      // Once state is updated, the cursor is pushed to the end of the string, which isn't ideal
      // if the indentation is made before the end of the string.
      // Doing this helps to preserve the cursor location.
      textAreaRef.current.value = newContent;
      textAreaRef.current.selectionStart = newCursorPos;
      textAreaRef.current.selectionEnd = newCursorPos;
    }
  };

  return (
    <div className={styles.editor}>
      <link
        href="https://cdn.jsdelivr.net/npm/prismjs@1.25.0/themes/prism.css"
        rel="stylesheet"
      />
      <textarea
        ref={textAreaRef}
        onChange={handleChange}
        value={content}
        onKeyDown={handleKeyDown}
        onScroll={syncScroll}
        onBlur={onBlur}
        spellCheck="false"
        disabled={readonly}
      />
      <pre ref={highlightedElementRef}>
        <code className={`language-${language}`}>{content}</code>
      </pre>
    </div>
  );
};
