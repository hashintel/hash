import { useEffect, useRef, useState } from "react";

import {
  BlockComponent,
  useGraphBlockService,
} from "@blockprotocol/graph/react";
import styles from "./app.module.css";
import { CopyIcon } from "./icons";
import { languages, LanguageType } from "./utils";
import { Editor } from "./editor";

type BlockEntityProperties = {
  caption?: string;
  language: LanguageType;
  content: string;
};

export const App: BlockComponent<BlockEntityProperties> = ({
  graph: { blockEntity, readonly },
}) => {
  const {
    entityId,
    properties: { caption, content, language },
  } = blockEntity;

  const blockRef = useRef<HTMLDivElement>(null);
  const { graphService } = useGraphBlockService(blockRef);

  const [localData, setLocalData] = useState(() => ({
    caption,
    content,
    language,
  }));
  const [copied, setCopied] = useState(false);
  const [captionIsVisible, setCaptionVisibility] = useState(
    caption && caption.length > 0,
  );
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const captionRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalData({
      caption,
      content,
      language,
    });
  }, [caption, content, language]);

  const updateLocalData = (
    newData: Partial<
      Pick<BlockEntityProperties, "caption" | "language" | "content">
    >,
  ) => {
    if (readonly) {
      return;
    }
    setLocalData({
      ...localData,
      ...newData,
    });
  };

  const updateRemoteData = (properties: BlockEntityProperties) => {
    if (readonly) {
      return;
    }
    void graphService?.updateEntity({
      data: {
        entityId,
        properties,
      },
    });
  };

  const handleLanguageChange = (newLanguage: LanguageType) => {
    const newData = {
      ...localData,
      language: newLanguage,
    };
    updateLocalData(newData);
    updateRemoteData(newData);
  };

  const copyToClipboard = async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- account for old browsers
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(localData.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return;
      }

      if (document.queryCommandEnabled("copy")) {
        if (!editorRef.current) return;
        editorRef.current.select();
        const success = document.execCommand("copy");

        if (success) {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console -- TODO: consider using logger
      console.error(err);
    }
  };

  const handleCaptionButtonClick = () => {
    setCaptionVisibility(true);
    setTimeout(() => {
      captionRef.current?.focus();
      captionRef.current?.setSelectionRange(0, captionRef.current.value.length);
    }, 0);
  };

  useEffect(() => {
    if (captionRef.current !== document.activeElement) {
      setCaptionVisibility(localData.caption && localData.caption.length > 0);
    }
  }, [localData.caption]);

  const handleCaptionInputBlur = () => {
    setCaptionVisibility(!!captionRef.current?.value.length);
    updateRemoteData(localData);
  };

  return (
    <div className={styles.block} ref={blockRef}>
      <div className={styles.blockInnerWrapper}>
        <div className={styles.topPanel}>
          <select
            className={styles.languageSelect}
            value={localData.language}
            onChange={(evt) =>
              handleLanguageChange(evt.target.value as LanguageType)
            }
          >
            {languages.map(({ code, title }) => (
              <option key={title} value={code}>
                {title}
              </option>
            ))}
          </select>

          <div className={styles.buttonContainer}>
            <button
              type="button"
              className={styles.copyToClipboardButton}
              onClick={copyToClipboard}
            >
              <span>{copied ? "Copied" : "Copy"}</span> <CopyIcon />
            </button>
            {!readonly && (
              <button
                type="button"
                className={styles.captionButton}
                onClick={handleCaptionButtonClick}
              >
                Caption
              </button>
            )}
          </div>
        </div>
        <Editor
          content={localData.content}
          setContent={(text) => updateLocalData({ content: text })}
          language={localData.language}
          editorRef={editorRef}
          onBlur={() => updateRemoteData(localData)}
          readonly={!!readonly}
        />
      </div>
      <input
        ref={captionRef}
        className={styles.caption}
        style={captionIsVisible ? {} : { visibility: "hidden" }}
        placeholder="Write a caption..."
        value={localData.caption ?? ""}
        onChange={(evt) => updateLocalData({ caption: evt.target.value })}
        onBlur={handleCaptionInputBlur}
      />
    </div>
  );
};
