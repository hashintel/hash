import { useGraphBlockModule } from "@blockprotocol/graph/react";
import { useServiceBlockModule } from "@blockprotocol/service/react";
import {
  BlockPromptInput,
  codeBlockFormattingPrompt,
  GetHelpLink,
} from "@hashintel/block-design-system";
import { Box, Collapse, Fade } from "@mui/material";
import { useCallback, useRef, useState } from "react";

import { contentKey } from "../app";
import { ArrowTurnDownLeftIcon } from "../icons/arrow-turn-down-left";
import type { BlockEntity } from "../types/generated/block-entity";
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

export const promptKey: keyof BlockEntity["properties"] =
  "https://blockprotocol.org/@blockprotocol/types/property-type/openai-text-model-prompt/";

export const modelKey: keyof BlockEntity["properties"] =
  "https://blockprotocol.org/@blockprotocol/types/property-type/openai-text-model-name/";

export const GenerateText = ({ blockEntity }: { blockEntity: BlockEntity }) => {
  const blockRootRef = useRef<HTMLDivElement>(null);

  const initialPromptText = blockEntity.properties[promptKey];
  const initialModel = blockEntity.properties[modelKey];

  const inputRef = useRef<HTMLInputElement>(null);

  /* @ts-expect-error –– @todo H-3839 packages in BP repo needs updating, or this package updating to use graph in this repo */
  const { graphModule } = useGraphBlockModule(blockRootRef);
  /* @ts-expect-error –– @todo H-3839 packages in BP repo needs updating */
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

  const onSubmit = useCallback(async () => {
    if (loading || !promptText.trim()) {
      return;
    }

    setError(false);
    setLoading(true);

    const { data, errors } = await completeChat(promptText);

    const choice = data?.choices[0];

    const textResponse = choice?.message?.content;

    if (errors ?? !textResponse) {
      setError(true);
      setLoading(false);
      return;
    }

    setGeneratedText(textResponse.trim());
    setAnimatingIn(true);

    setLoading(false);
    inputRef.current?.blur();
  }, [loading, promptText, completeChat]);

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
