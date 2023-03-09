import { RemoteFileEntity } from "@blockprotocol/graph";
import { useGraphBlockModule } from "@blockprotocol/graph/react";
import { useServiceBlockModule } from "@blockprotocol/service/react";
import { Button, TextField } from "@hashintel/design-system";
import {
  Box,
  buttonBaseClasses,
  Collapse,
  Fade,
  inputBaseClasses,
  Link,
  outlinedInputClasses,
  Typography,
} from "@mui/material";
import { FormEvent, useCallback, useRef, useState } from "react";

import { generatedLinkKey } from "../app";
import { AbstractAiIcon } from "../icons/abstract-ai";
import { ArrowTurnDownLeftIcon } from "../icons/arrow-turn-down-left";
import { QuestionCircleIcon } from "../icons/question-circle";
import { RootEntity } from "../types";
import { BouncingDotsLoader } from "./generate-image/bouncing-dots-loader";
import { ImagePreview } from "./generate-image/image-preview";

export type ImageObject = {
  url: string;
};

const promptKey: keyof RootEntity["properties"] =
  "https://blockprotocol.org/@blockprotocol/types/property-type/openai-image-model-prompt/";

const isFileEntity = (
  image: RemoteFileEntity | ImageObject,
): image is RemoteFileEntity => "properties" in image;

export const GenerateImage = ({ blockEntity }: { blockEntity: RootEntity }) => {
  const blockRootRef = useRef<HTMLDivElement>(null);
  const { graphModule } = useGraphBlockModule(blockRootRef);
  const { serviceModule } = useServiceBlockModule(blockRootRef);

  const initialPromptText = blockEntity.properties[promptKey];

  const inputRef = useRef<HTMLInputElement>(null);

  const [inputFocused, setInputFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [promptText, setPromptText] = useState(initialPromptText ?? "");
  const [images, setImages] = useState<
    ImageObject[] | RemoteFileEntity[] | null
  >(null);

  const [animatingIn, setAnimatingIn] = useState(false);
  const [animatingOut, setAnimatingOut] = useState(false);

  const uploadInProgress = images?.some((image) => !isFileEntity(image));

  const confirm = (imageEntityId: string) => {
    void graphModule.createEntity({
      data: {
        entityTypeId: generatedLinkKey,
        linkData: {
          leftEntityId: blockEntity.metadata.recordId.entityId,
          rightEntityId: imageEntityId,
        },
        properties: {},
      },
    });
    void graphModule.updateEntity({
      data: {
        entityId: blockEntity.metadata.recordId.entityId,
        entityTypeId: blockEntity.metadata.entityTypeId,
        properties: { [promptKey]: promptText },
      },
    });
  };

  const generateAndUploadImages = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (loading || promptText.trim().length === 0) {
        return;
      }

      setErrorMessage("");
      setLoading(true);
      const { data, errors } = await serviceModule.openaiCreateImage({
        data: {
          prompt: promptText,
          n: 4,
        },
      });

      if (!data || errors) {
        setErrorMessage(
          errors?.[0]?.message ?? "Could not contact OpenAI's image service",
        );
        setLoading(false);
        setImages(null);
        return;
      }

      const generatedImages = data.data.filter(
        (image): image is ImageObject => !!image.url,
      );

      setImages(generatedImages);
      setAnimatingIn(true);

      try {
        const uploadedImages = await Promise.all(
          generatedImages.map((image) =>
            graphModule
              .uploadFile({
                data: { description: promptText, url: image.url },
              })
              .then((response) => {
                if (response.data) {
                  return response.data;
                }
                throw new Error(
                  response.errors?.[0]?.message ?? "Error uploading image",
                );
              }),
          ),
        );

        setImages(uploadedImages);
      } catch (err) {
        setErrorMessage(
          `Could not upload images: ${
            err instanceof Error ? err.message : "unknown error"
          }`,
        );
        setLoading(false);
        setImages(null);
      }

      setLoading(false);

      inputRef.current?.blur();
    },
    [loading, promptText, serviceModule, graphModule],
  );

  return (
    <Box
      ref={blockRootRef}
      style={{ fontFamily: "colfax-web", fontWeight: 400 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Fade in={hovered || inputFocused || animatingIn || animatingOut}>
        <Box sx={{ display: "flex", columnGap: 3, flexWrap: "wrap" }}>
          <Link
            href="https://blockprotocol.org/@hash/blocks/ai-image"
            target="_blank"
            variant="regularTextLabels"
            sx={({ palette }) => ({
              display: "inline-flex",
              alignItems: "center",
              textDecoration: "none",
              fontSize: 15,
              lineHeight: 1,
              letterSpacing: -0.02,
              marginBottom: 1.5,
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
            <QuestionCircleIcon sx={{ fontSize: 16, ml: 1, fill: "inherit" }} />
          </Link>

          <Typography
            variant="regularTextLabels"
            sx={{
              display: "inline-flex",
              alignItems: "center",
              textDecoration: "none",
              fontSize: 15,
              lineHeight: 1,
              letterSpacing: -0.02,
              marginBottom: 1.5,
              flexWrap: "wrap",
              color: ({ palette }) => palette.gray[50],
            }}
          >
            <Box component="span" sx={{ mr: 1 }}>
              Using
            </Box>
            <Box
              component="span"
              sx={{
                display: "inline-flex",
                alignItems: "center",
                color: ({ palette }) => palette.gray[60],
                mr: 1,
              }}
            >
              <AbstractAiIcon sx={{ fontSize: 16, mr: 0.375 }} />
              OpenAI DALL-E
            </Box>
          </Typography>
        </Box>
      </Fade>

      <Collapse
        in={!images?.length && !animatingIn}
        onEntered={() => setAnimatingOut(false)}
        onExited={() => setAnimatingIn(false)}
      >
        <form onSubmit={generateAndUploadImages}>
          <TextField
            autoFocus
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            onChange={(event) => setPromptText(event.target.value)}
            placeholder="Enter a prompt to generate image, and hit enter"
            required
            ref={inputRef}
            disabled={loading || uploadInProgress}
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
                  disabled={loading || uploadInProgress}
                  sx={({ palette }) => ({
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
                  ) : uploadInProgress ? (
                    <>
                      UPLOADING <BouncingDotsLoader />
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
              {errorMessage}
            </Typography>
          )}
        </form>
      </Collapse>

      <Collapse
        in={!!images?.length && !animatingOut && !animatingIn}
        onExited={() => setImages(null)}
      >
        {images && (
          <ImagePreview
            onConfirm={(image) => {
              confirm(image.metadata.recordId.entityId);
            }}
            onDiscard={() => {
              setAnimatingOut(true);
              inputRef.current?.focus();
            }}
            images={images}
            prompt={promptText}
            uploadInProgress={!!uploadInProgress}
          />
        )}
      </Collapse>
    </Box>
  );
};
