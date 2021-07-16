import React, { useEffect, useState, VoidFunctionComponent } from "react";

import { BlockProtocolProps } from "./types/blockProtocol";

import { ProviderNames } from "./types/embedTypes";

type AppProps = {
  displayName?: string;
  embedType?: ProviderNames;
  getEmbedBlock: (url: string, type?: ProviderNames) => void;
  html?: string;
  loading?: boolean;
  errorString?: string;
};

function DisplayEmbed({ embedCode }: { embedCode: string }) {
  return <div dangerouslySetInnerHTML={{ __html: embedCode }} />;
}

export const App: VoidFunctionComponent<AppProps & BlockProtocolProps> = ({
  displayName,
  embedType,
  getEmbedBlock,
  html,
}) => {
  const [displayState, setDisplayState] =
    useState<"display_input" | "display_embed">("display_input");

  const [inputText, setTextInput] = useState("");

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (inputText.trim()) {
      await getEmbedBlock(inputText, embedType);
    }
  };

  if (html) {
    return <DisplayEmbed embedCode={html} />;
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
          placeholder={`Enter ${displayName ? `${displayName} ` : ``}URL`}
        />
      </div>
      <div style={{ marginTop: 8 }}>
        <button type="submit">Embed Link</button>
      </div>
    </form>
  );
};
