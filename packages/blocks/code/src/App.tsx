import React, { useEffect, useRef, useState } from "react";
import { tw } from "twind";

import { BlockComponent } from "blockprotocol/react";
import { BlockProtocolUpdateEntitiesAction } from "blockprotocol";
import { CopyIcon } from "./Icons";
import { languages, LanguageType } from "./utils";
import { Editor } from "./components/Editor";

type AppProps = {
  caption?: string;
  language: LanguageType;
  content: string;
};

export const App: BlockComponent<AppProps> = ({
  entityId,
  entityTypeId,
  entityTypeVersionId,
  accountId,
  caption,
  content,
  language,
  updateEntities,
}) => {
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
    newData: Partial<Pick<AppProps, "caption" | "language" | "content">>,
  ) => {
    setLocalData({
      ...localData,
      ...newData,
    });
  };

  const updateRemoteData = (properties: AppProps) => {
    void updateEntities?.([
      {
        accountId,
        data: properties,
        entityId,
        entityTypeId,
        entityTypeVersionId,
      },
    ] as BlockProtocolUpdateEntitiesAction[]);
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
      captionRef.current?.setSelectionRange(
        0,
        captionRef.current?.value.length,
      );
    }, 0);
  };

  useEffect(() => {
    if (captionRef.current !== document.activeElement) {
      setCaptionVisibility(localData.caption && localData.caption?.length > 0);
    }
  }, [localData.caption]);

  const handleCaptionInputBlur = () => {
    setCaptionVisibility(!!captionRef.current?.value.length);
    updateRemoteData(localData);
  };

  return (
    <div className={tw`w-full`}>
      <div
        className={tw`group px-10 pt-12 pb-3 relative bg-yellow-100 bg-opacity-50 mb-1`}
      >
        <div
          className={tw`transition-all invisible opacity-0 visible opacity-100 group-hover:visible group-hover:opacity-100 absolute top-2 left-4 right-4 flex justify-between text-xs text-gray-500`}
        >
          <select
            className={tw`py-1 px-2 bg-transparent cursor-pointer hover:bg-black hover:bg-opacity-10 rounded-md `}
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

          <div className={tw`flex`}>
            <button
              type="button"
              className={tw`mr-2 bg-black flex items-center bg-opacity-10 hover:bg-opacity-20 px-2 py-1 rounded-md`}
              onClick={copyToClipboard}
            >
              <span className={tw`mr-1`}>{copied ? "Copied" : "Copy"}</span>{" "}
              <CopyIcon />
            </button>
            <button
              type="button"
              className={tw`bg-black bg-opacity-10 hover:bg-opacity-20 px-2 py-1 rounded-md`}
              onClick={handleCaptionButtonClick}
            >
              Caption
            </button>
          </div>
        </div>
        <Editor
          content={localData.content}
          setContent={(text) => updateLocalData({ content: text })}
          language={localData.language}
          editorRef={editorRef}
          onBlur={() => updateRemoteData(localData)}
        />
      </div>
      <input
        ref={captionRef}
        className={tw`text-sm text-gray-400 outline-none w-full ${
          captionIsVisible ? "" : "invisible"
        }`}
        placeholder="Write a caption..."
        value={localData.caption ?? ""}
        onChange={(evt) => updateLocalData({ caption: evt.target.value })}
        onBlur={handleCaptionInputBlur}
      />
    </div>
  );
};
