import { useGraphBlockModule } from "@blockprotocol/graph/react";
import { useServiceBlockModule } from "@blockprotocol/service/react";
import { faQuestionCircle } from "@fortawesome/free-regular-svg-icons";
import { Button, FontAwesomeIcon } from "@hashintel/design-system";
import {
  Box,
  buttonBaseClasses,
  Collapse,
  Fade,
  inputBaseClasses,
  Link,
  outlinedInputClasses,
  TextField,
  Typography,
} from "@mui/material";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { contentKey } from "../app";
import { ArrowTurnDownLeftIcon } from "../icons/arrow-turn-down-left";
import { RootEntity } from "../types";
import { BouncingDotsLoader } from "./generate-text/bouncing-dots-loader";
import {
  DEFAULT_MODEL_ID,
  ModelSelector,
} from "./generate-text/model-selector";
import { TextPreview } from "./generate-text/text-preview";

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
  const [errorMessage, setErrorMessage] = useState("");

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

  const onSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();

      if (loading || !promptText.trim()) {
        return;
      }

      setErrorMessage("");
      setLoading(true);

      const isTurbo = model === "gpt-3.5-turbo";
      const { data, errors } = await (isTurbo
        ? serviceModule.openaiCompleteChat({
            data: {
              max_tokens: 1000,
              messages: [{ role: "user", content: promptText }],
              model: "gpt-3.5-turbo",
            },
          })
        : serviceModule.openaiCompleteText({
            data: {
              max_tokens: 1000,
              model,
              prompt: promptText,
            },
          }));

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
        setErrorMessage("An error occurred");
        setLoading(false);
        return;
      }

      setGeneratedText(textResponse.replace(/^\n\n/, ""));
      setAnimatingIn(true);

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
    <Box
      ref={blockRootRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Fade in={true || hovered || inputFocused || animatingIn || animatingOut}>
        <Box sx={{ display: "flex", columnGap: 3, flexWrap: "wrap", mb: 1.5 }}>
          <Link
            href="https://blockprotocol.org/@hash/blocks/ai-text"
            target="_blank"
            variant="regularTextLabels"
            sx={({ palette }) => ({
              display: "inline-flex",
              alignItems: "center",
              textDecoration: "none",
              fontSize: 15,
              lineHeight: 1,
              letterSpacing: -0.02,
              whiteSpace: "nowrap",
              color: palette.gray[50],
              fill: palette.gray[40],
              ":hover": {
                color: palette.gray[60],
                fill: palette.gray[50],
              },
            })}
          >
            Get help{" "}
            <FontAwesomeIcon
              icon={faQuestionCircle}
              sx={{ fontSize: 16, ml: 1, fill: "inherit" }}
            />
          </Link>

          <Fade in={!generatedText}>
            <Box display="flex" gap={1} alignItems="center">
              <ModelSelector model={model} onModelChange={setModel} />
            </Box>
          </Fade>
        </Box>
      </Fade>

      <Collapse
        in={!generatedText && !animatingIn}
        onEntered={() => setAnimatingOut(false)}
        onExited={() => setAnimatingIn(false)}
      >
        <form onSubmit={onSubmit}>
          <TextField
            multiline
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            onChange={(event) => setPromptText(event.target.value)}
            onKeyDown={async (event) => {
              const { shiftKey, code } = event;
              if (!shiftKey && code === "Enter") {
                await onSubmit(event);
              }
            }}
            placeholder="Enter a prompt to generate image, and hit enter"
            required
            ref={inputRef}
            disabled={loading}
            sx={({ palette }) => ({
              maxWidth: 580,
              width: 1,
              [`& .${inputBaseClasses.input}`]: {
                minHeight: "unset",
                fontSize: 16,
                lineHeight: "21px",
                paddingY: 2.125,
                paddingLeft: 2.75,
                paddingRight: 0,
              },
              [`& .${inputBaseClasses.disabled}`]: {
                background: palette.gray[10],
                color: palette.gray[70],
              },
              [`& .${outlinedInputClasses.notchedOutline}`]: {
                border: `1px solid ${palette.gray[20]}`,
              },
            })}
            InputProps={{
              endAdornment: (
                <Button
                  type="submit"
                  variant="tertiary_quiet"
                  disabled={loading}
                  sx={({ palette }) => ({
                    alignSelf: "flex-end",
                    fontSize: 13,
                    fontWeight: 700,
                    letterSpacing: "-0.02em",
                    lineHeight: 1,
                    color: palette.blue[70],
                    textTransform: "uppercase",
                    height: 55,
                    width: 1,
                    maxHeight: 55,
                    maxWidth: 168,
                    minHeight: 51,
                    [`&.${buttonBaseClasses.disabled}`]: {
                      color: palette.common.black,
                      background: "none",
                    },
                  })}
                >
                  {loading ? (
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
                  )}
                </Button>
              ),
            }}
            value={promptText}
          />

          {errorMessage && (
            <Typography
              sx={{
                color: ({ palette }) => palette.red[50],
                fontSize: 14,
                fontWeight: 500,
                marginTop: 1.25,
              }}
            >
              Could not contact OpenAI
            </Typography>
          )}
        </form>
      </Collapse>

      <Collapse
        in={!!generatedText && !animatingOut && !animatingIn}
        onExited={() => setGeneratedText("")}
      >
        {generatedText && (
          <TextPreview
            onConfirm={confirm}
            onDiscard={() => setAnimatingOut(true)}
            prompt={promptText}
            text={generatedText}
          />
        )}
      </Collapse>
    </Box>
  );
};
