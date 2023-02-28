import { useGraphBlockModule } from "@blockprotocol/graph/react";
import { useServiceBlockModule } from "@blockprotocol/service/react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { contentKey } from "../app";
import { RootEntity } from "../types";
import { TextPreview } from "./generate-text/text-preview";

export const promptKey: keyof RootEntity["properties"] =
  "https://blockprotocol-9a7200lt2.stage.hash.ai/@ciaranm/types/property-type/prompt/";

export const modelKey: keyof RootEntity["properties"] =
  "https://blockprotocol-9a7200lt2.stage.hash.ai/@ciaranm/types/property-type/model/";

export const GenerateText = ({ blockEntity }: { blockEntity: RootEntity }) => {
  const blockRootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { graphModule } = useGraphBlockModule(blockRootRef);
  const { serviceModule } = useServiceBlockModule(blockRootRef);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // @todo implement model selection UI
  // @see https://app.asana.com/0/1203358502199087/1203701786066059/f
  const [model, _setModel] = useState("text-davinci-003");
  const [promptText, setPromptText] = useState("");
  const [generatedText, setGeneratedText] = useState("");

  const {
    metadata: {
      entityTypeId,
      recordId: { entityId },
    },
  } = blockEntity;

  const onSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();

      if (loading || !promptText.trim()) {
        return;
      }

      setErrorMessage("");
      setLoading(true);

      const { data, errors } = await serviceModule.openaiCompleteText({
        data: {
          max_tokens: 1000,
          model,
          prompt: promptText,
        },
      });

      const textResponse = data?.choices[0]?.text;

      if (errors || !textResponse) {
        setErrorMessage("An error occurred");
        setLoading(false);
        return;
      }

      setGeneratedText(textResponse.replace(/^\n\n/, ""));

      setLoading(false);
      inputRef.current?.blur();
    },
    [loading, model, promptText, serviceModule],
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const confirm = () =>
    graphModule.updateEntity({
      data: {
        entityId,
        entityTypeId,
        properties: {
          [contentKey]: generatedText,
          [modelKey]: model,
          [promptKey]: promptText,
        },
      },
    });

  return (
    <div
      ref={blockRootRef}
      style={{ fontFamily: "colfax-web", fontWeight: 400 }}
    >
      <link rel="stylesheet" href="https://use.typekit.net/igj4jff.css" />
      <form onSubmit={onSubmit}>
        <label>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 10 }}>
            DESCRIBE THE TEXT TO GENERATE
          </div>
          <input
            onChange={(event) => setPromptText(event.target.value)}
            placeholder="Enter a prompt to generate text"
            required
            ref={inputRef}
            style={{
              border: "1px solid rgba(235, 242, 247, 1)",
              borderRadius: 10,
              boxShadow:
                "0px 4px 11px rgba(39, 50, 86, 0.04), 0px 2.59259px 6.44213px rgba(39, 50, 86, 0.08), 0px 0.5px 1px rgba(39, 50, 86, 0.15)",
              fontSize: 16,
              fontFamily: "colfax-web",
              marginRight: -14,
              height: 54,
              padding: "0 31px 0 16px",
              width: 400,
              maxWidth: "100%",
            }}
            value={promptText}
          />
        </label>
        {promptText.trim().length > 0 && (
          <button
            disabled={loading || !!generatedText}
            style={{
              background: loading
                ? "#0059A5"
                : generatedText
                ? "rgba(221, 231, 240, 1)"
                : "#0775E3",
              borderRadius: 10,
              boxShadow:
                "0px 4px 11px rgba(39, 50, 86, 0.04), 0px 2.59259px 6.44213px rgba(39, 50, 86, 0.08), 0px 0.5px 1px rgba(39, 50, 86, 0.15)",
              color: loading
                ? "rgba(180, 226, 253, 1)"
                : generatedText
                ? "rgba(117, 138, 161, 1)"
                : "white",
              cursor: "pointer",
              border: "none",
              fontWeight: 600,
              fontSize: 14,
              height: 55,
              padding: "0px 15px",
              position: "relative",
            }}
            type="submit"
          >
            {loading
              ? "GENERATING ..."
              : generatedText
              ? "GENERATED"
              : "GENERATE TEXT"}
          </button>
        )}
        {errorMessage && (
          <div
            style={{
              color: "red",
              fontSize: 14,
              fontWeight: 500,
              marginTop: 10,
            }}
          >
            Could not contact OpenAI
          </div>
        )}
      </form>
      {generatedText && (
        <TextPreview
          onConfirm={confirm}
          onDiscard={() => setGeneratedText("")}
          text={generatedText}
        />
      )}
    </div>
  );
};
