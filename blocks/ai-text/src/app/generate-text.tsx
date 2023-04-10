import { useGraphBlockModule } from "@blockprotocol/graph/react";
import { useServiceBlockModule } from "@blockprotocol/service/react";
import { BlockPromptInput, GetHelpLink } from "@hashintel/block-design-system";
import { codeBlockFormattingPrompt } from "@hashintel/design-system";
import { Box, Collapse, Fade } from "@mui/material";
import { useCallback, useRef, useState } from "react";

import { contentKey } from "../app";
import { ArrowTurnDownLeftIcon } from "../icons/arrow-turn-down-left";
import { RootEntity } from "../types";
import { BouncingDotsLoader } from "./generate-text/bouncing-dots-loader";
import {
  DEFAULT_MODEL_ID,
  ModelSelector,
} from "./generate-text/model-selector";
import { TextPreview } from "./generate-text/text-preview";

const completeChatSystemPrompt = [
  "You are ChatGPT, a large language model trained by OpenAI.",
  "Answer as concisely as possible.",
  codeBlockFormattingPrompt,
  `Current date: ${new Date().toISOString()}.`,
].join(" ");

export const promptKey: keyof RootEntity["properties"] =
  "https://blockprotocol.org/@blockprotocol/types/property-type/openai-text-model-prompt/";

export const modelKey: keyof RootEntity["properties"] =
  "https://blockprotocol.org/@blockprotocol/types/property-type/openai-text-model-name/";

export const GenerateText = ({ blockEntity }: { blockEntity: RootEntity }) => {
  const blockRootRef = useRef<HTMLDivElement>(null);

  const initialPromptText = blockEntity.properties[promptKey];
  const initialModel = blockEntity.properties[modelKey];

  const inputRef = useRef<HTMLInputElement>(null);

  const { graphModule } = useGraphBlockModule(blockRootRef);
  const { serviceModule } = useServiceBlockModule(blockRootRef);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const [selectorOpen, setSelectorOpen] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [hovered, setHovered] = useState(false);

  const [model, setModel] = useState(initialModel ?? DEFAULT_MODEL_ID);
  const [promptText, setPromptText] = useState(initialPromptText ?? "");
  const [generatedText, setGeneratedText] = useState("");

  const [animatingIn, setAnimatingIn] = useState(false);
  const [animatingOut, setAnimatingOut] = useState(false);

  const {
    metadata: {
      entityTypeId,
      recordId: { entityId },
    },
  } = blockEntity;

  const completeChat = useCallback(
    (prompt: string) =>
      serviceModule.openaiCompleteChat({
        data: {
          messages: [
            {
              role: "system",
              content: completeChatSystemPrompt,
            },
            { role: "user", content: prompt },
          ],
          model: "gpt-3.5-turbo",
        },
      }),
    [serviceModule],
  );

  const completeText = useCallback(
    (prompt: string) => {
      const promptWithFormatting = `${prompt} (${codeBlockFormattingPrompt})`;

      /**
       * This estimate is inaccurate, as character length does not equal
       * token length for a given string. A browser-compatible implementation
       * of the `gpt-3-encoder` package would be required to accurately determine
       * the number of tokens in the string.
       *
       * @see https://www.npmjs.com/package/gpt-3-encoder
       *
       * @todo consider using a WASM, endpoint or other solution to accurately
       * determine the number of tokens in the string.
       */
      const maxTokens =
        (model === "text-davinci-003" ? 4000 : 2000) -
        promptWithFormatting.length;

      return serviceModule.openaiCompleteText({
        data: { max_tokens: maxTokens, model, prompt: promptWithFormatting },
      });
    },
    [serviceModule, model],
  );

  const onSubmit = useCallback(async () => {
    if (loading || !promptText.trim()) {
      return;
    }

    setError(false);
    setLoading(true);

    const isTurbo = model === "gpt-3.5-turbo";
    const { data, errors } = await (isTurbo
      ? completeChat(promptText)
      : completeText(promptText));

    const choice = data?.choices[0];

    let textResponse: string | undefined;
    if (choice) {
      if ("message" in choice) {
        textResponse = choice.message?.content;
      } else if ("text" in choice) {
        textResponse = choice.text;
      }
    }

    if (errors || !textResponse) {
      setError(true);
      setLoading(false);
      return;
    }

    setGeneratedText(textResponse.trim());
    setAnimatingIn(true);

    setLoading(false);
    inputRef.current?.blur();
  }, [loading, model, promptText, completeChat, completeText]);

  const handleDiscard = () => {
    setAnimatingOut(true);
  };

  const regeneratePrompt = () => {
    handleDiscard();
    void onSubmit();
  };

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
    <Box
      ref={blockRootRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Fade
        in={
          hovered || inputFocused || animatingIn || animatingOut || selectorOpen
        }
      >
        <Box sx={{ display: "flex", columnGap: 3, flexWrap: "wrap", mb: 1.5 }}>
          <GetHelpLink href="https://blockprotocol.org/@hash/blocks/ai-text" />

          <Fade in={!generatedText}>
            <Box display="flex" gap={1} alignItems="center">
              <ModelSelector
                open={selectorOpen}
                onOpen={() => setSelectorOpen(true)}
                onClose={() => setSelectorOpen(false)}
                value={model}
                onChange={setModel}
              />
            </Box>
          </Fade>
        </Box>
      </Fade>

      <Collapse
        in={!generatedText && !animatingIn}
        onEntered={() => setAnimatingOut(false)}
        onExited={() => setAnimatingIn(false)}
      >
        <BlockPromptInput
          value={promptText}
          onSubmit={onSubmit}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          onChange={(event) => setPromptText(event.target.value)}
          placeholder="Enter a prompt to generate text, and hit enter"
          ref={inputRef}
          disabled={loading}
          buttonLabel={
            loading ? (
              <>
                GENERATING <BouncingDotsLoader />
              </>
            ) : (
              <>
                Submit Prompt{" "}
                <ArrowTurnDownLeftIcon
                  sx={{
                    ml: 1,
                    fontSize: 12,
                  }}
                />
              </>
            )
          }
          error={error}
          apiName="OpenAI"
        />
      </Collapse>

      <Collapse
        in={!!generatedText && !animatingOut && !animatingIn}
        onExited={() => setGeneratedText("")}
      >
        {generatedText && (
          <TextPreview
            onConfirm={confirm}
            onDiscard={handleDiscard}
            onRegenerate={regeneratePrompt}
            prompt={promptText}
            text={generatedText}
          />
        )}
      </Collapse>
    </Box>
  );
};
