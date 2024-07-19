import Prism from "prismjs";
import type { ChangeEvent, KeyboardEvent, RefObject , useCallback, useEffect, useRef } from "react";
import styles from "./editor.module.css";
import type { LanguageType } from "./utils";

interface IEditorProps {
  content: string;
  setContent: (content: string) => void;
  language: LanguageType;
  editorRef: RefObject<HTMLTextAreaElement>;
  onBlur: () => void;
  readonly: boolean;
}

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
    if (!highlightedElementRef.current) {return;}
    Prism.highlightElement(highlightedElementRef.current.children[0]!);
  }, [language, content]);

  /**
   * This ensures the code block scrolls with
   * the textarea.
   *
   */
  const syncScroll = useCallback(() => {
    if (!highlightedElementRef.current || !textAreaRef.current) {return;}

    highlightedElementRef.current.scrollLeft = textAreaRef.current.scrollLeft;
  }, [textAreaRef, highlightedElementRef]);

  /**
   * This helps in updating the height of the textarea especially when a new
   * line is added/removed and updates the height of the code block.
   */
  const syncHeight = useCallback(() => {
    const textAreaElement = textAreaRef.current;
    const preElement = highlightedElementRef.current; // <pre> element

    if (!textAreaElement || !preElement) {return;}

    const hasHorizontalScrollbar =
      textAreaElement.scrollWidth > textAreaElement.clientWidth;
    const additionalHeight = hasHorizontalScrollbar ? 30 : 0;

    textAreaElement.style.height = "auto";
    textAreaElement.style.height = `${textAreaElement.scrollHeight + additionalHeight}px`;
    preElement.style.height = `${textAreaElement.scrollHeight + additionalHeight}px`;
  }, [textAreaRef, highlightedElementRef]);

  useEffect(() => {
    const resizeListener = () => {
      syncHeight();
    };

    window.addEventListener("resize", resizeListener);

    return () => { window.removeEventListener("resize", resizeListener); };
  });

  useEffect(() => {
    syncHeight();
    syncScroll();
  }, [content, syncScroll, syncHeight]);

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setContent(event.target.value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!textAreaRef.current) {return;}

    if (event.key === "Tab") {
      event.preventDefault();
      const { selectionStart } = event.currentTarget;
      let newCursorPos;
      let newContent;

      if (event.shiftKey) {
        // The previous character has to be a tab
        if (content.substring(selectionStart - 1, selectionStart) !== "\t") {
          return;
        }

        newContent = `${content.slice(
          0,
          Math.max(0, selectionStart - 1),
        )}${content.slice(Math.max(0, selectionStart))}`;

        newCursorPos = selectionStart - 1;
      } else {
        newContent = `${content.slice(
          0,
          Math.max(0, selectionStart),
        )}\t${content.slice(Math.max(0, selectionStart))}`;
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
        href={"https://cdn.jsdelivr.net/npm/prismjs@1.25.0/themes/prism.css"}
        rel={"stylesheet"}
      />
      <textarea
        ref={textAreaRef}
        value={content}
        spellCheck={"false"}
        disabled={readonly}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onScroll={syncScroll}
        onBlur={onBlur}
      />
      <pre ref={highlightedElementRef}>
        <code className={`language-${language}`}>{content}</code>
      </pre>
    </div>
  );
};
