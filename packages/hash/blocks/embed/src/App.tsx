import React, { useEffect, useState, VoidFunctionComponent } from "react";

import { BlockProtocolProps } from "./types/blockProtocol";
import { ProviderNames } from "./types/embedTypes";
import { HtmlBlock } from "./HtmlBlock";

type AppProps = {
  placeholderText?: string;
  buttonText?: string;
  bottomText?: string;
  embedType?: ProviderNames;
  getEmbedBlock: (url: string, type?: ProviderNames) => void;
  html?: string;
  loading?: boolean;
  errorString?: string;
};

export const App: VoidFunctionComponent<AppProps & BlockProtocolProps> = ({
  placeholderText,
  buttonText,
  bottomText,
  embedType,
  getEmbedBlock,
  errorString,
  html,
}) => {
  const [displayState, setDisplayState] =
    useState<"display_input" | "display_embed">("display_input");

  const [inputText, setTextInput] = useState("");
  const [edit, setEdit] = useState(false);

  useEffect(() => {
    if (errorString?.trim()) {
      alert(errorString);
    }
  }, [errorString]);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (inputText.trim()) {
      await getEmbedBlock(inputText, embedType);
      setEdit(false);
    }
  };

  if (html && !edit) {
    return (
      <div style={{ display: "flex" }}>
        <HtmlBlock html={html} />
        <button
          onClick={() => setEdit(true)}
          style={{ marginLeft: 8, height: "max-content" }}
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <div>
        <input
          required
          style={{
            padding: "0.5em",
            borderRadius: "6px",
            border: "1px solid black",
          }}
          onChange={(event) => setTextInput(event.target.value)}
          type="url"
          placeholder={placeholderText ? placeholderText : `Enter URL`}
        />
      </div>
      <div style={{ marginTop: 8 }}>
        <button type="submit">{buttonText ? buttonText : `Embed Link`}</button>
      </div>
      <div style={{ marginTop: 8, color: "rgb(139, 139, 139)" }}>
        {bottomText ? bottomText : "Works with any Oembed supporting link"}
      </div>
    </form>
  );
};
