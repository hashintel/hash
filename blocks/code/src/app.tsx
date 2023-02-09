import {
  BlockComponent,
  useEntitySubgraph,
  useGraphBlockService,
} from "@blockprotocol/graph/react";
import { useEffect, useRef, useState } from "react";

import styles from "./app.module.css";
import { Editor } from "./editor";
import { CopyIcon } from "./icons";
import { RootEntity } from "./types";
import { languages, LanguageType } from "./utils";

export const App: BlockComponent<RootEntity> = ({
  graph: { blockEntitySubgraph, readonly },
}) => {
  if (!blockEntitySubgraph) {
    throw new Error("No blockEntitySubgraph provided");
  }

  const { rootEntity: blockEntity } = useEntitySubgraph(blockEntitySubgraph);

  const captionKey =
    "https://alpha.hash.ai/@ciaran/types/property-type/caption/";
  const contentKey =
    "https://alpha.hash.ai/@ciaran/types/property-type/content/";
  const languageKey =
    "https://alpha.hash.ai/@ciaran/types/property-type/language/";

  const {
    metadata: {
      editionId: { baseId: entityId },
      entityTypeId,
    },
    properties: {
      [captionKey]: caption,
      [contentKey]: content,
      [languageKey]: language,
    },
  } = blockEntity;

  const blockRef = useRef<HTMLDivElement>(null);
  const { graphService } = useGraphBlockService(blockRef);

  const [localData, setLocalData] = useState(() => ({
    [captionKey]: caption,
    [contentKey]: content,
    [languageKey]: language,
  }));
  const [copied, setCopied] = useState(false);
  const [captionIsVisible, setCaptionVisibility] = useState(
    caption && caption.length > 0,
  );
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const captionRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalData({
      [captionKey]: caption,
      [contentKey]: content,
      [languageKey]: language,
    });
  }, [caption, content, language]);

  const updateLocalData = (newData: Partial<RootEntity["properties"]>) => {
    if (readonly) {
      return;
    }
    setLocalData({
      ...localData,
      ...newData,
    });
  };

  const updateRemoteData = (properties: RootEntity["properties"]) => {
    if (readonly) {
      return;
    }
    void graphService.updateEntity({
      data: {
        entityId,
        entityTypeId,
        properties,
      },
    });
  };

  const handleLanguageChange = (newLanguage: LanguageType) => {
    const newData = {
      ...localData,
      [languageKey]: newLanguage,
    };
    updateLocalData(newData);
    updateRemoteData(newData);
  };

  const copyToClipboard = async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- account for old browsers
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(localData[contentKey]);
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
      setCaptionVisibility(
        localData[captionKey] && localData[captionKey].length > 0,
      );
    }
  }, [localData]);

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
            value={localData[languageKey]}
            onChange={
              // @todo remove assertion when the type system supports enums and CodeSnippet type is update
              (evt) => handleLanguageChange(evt.target.value as LanguageType)
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
          content={localData[contentKey]}
          setContent={(text) => updateLocalData({ [contentKey]: text })}
          // @todo remove assertion when the type system supports enums and CodeSnippet type is update
          language={localData[languageKey] as LanguageType}
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
        value={localData[captionKey] ?? ""}
        onChange={(evt) => updateLocalData({ [captionKey]: evt.target.value })}
        onBlur={handleCaptionInputBlur}
      />
    </div>
  );
};
