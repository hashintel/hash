import { useGraphBlockModule } from "@blockprotocol/graph/react";
import { useServiceBlockModule } from "@blockprotocol/service/react";
import {
  BlockErrorMessage,
  BlockSettingsButton,
  Button,
  GetHelpLink,
} from "@hashintel/design-system";
import {
  Box,
  buttonBaseClasses,
  Collapse,
  Fade,
  inputBaseClasses,
  outlinedInputClasses,
  TextField,
  Typography,
} from "@mui/material";
import { FormEvent, useCallback, useRef, useState } from "react";
import { v4 as uuid } from "uuid";

import { generatedLinkKey, urlKey } from "../app";
import { AbstractAiIcon } from "../icons/abstract-ai";
import { ArrowTurnDownLeftIcon } from "../icons/arrow-turn-down-left";
import { RootEntity } from "../types";
import { BouncingDotsLoader } from "./generate-image/bouncing-dots-loader";
import {
  DEFAULT_IMAGE_NUMBER,
  ImageNumberSelector,
} from "./generate-image/image-number-selector";
import { ImagePreview } from "./generate-image/image-preview";

export type ImageObject = {
  id: string;
  entityId?: string;
  url?: string;
  date?: string;
};

const promptKey: keyof RootEntity["properties"] =
  "https://blockprotocol.org/@blockprotocol/types/property-type/openai-image-model-prompt/";

export const GenerateImage = ({
  blockEntity,
  isMobile,
}: {
  blockEntity: RootEntity;
  isMobile?: boolean;
}) => {
  const blockRootRef = useRef<HTMLDivElement>(null);
  const { graphModule } = useGraphBlockModule(blockRootRef);
  const { serviceModule } = useServiceBlockModule(blockRootRef);

  const initialPromptText = blockEntity.properties[promptKey];

  const inputRef = useRef<HTMLInputElement>(null);

  const [inputFocused, setInputFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [mobileSettingsExpanded, setMobileSettingsExpanded] = useState(false);
  const [loading, setLoading] = useState<false | "service" | "upload">(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [promptText, setPromptText] = useState(initialPromptText ?? "");
  const [images, setImages] = useState<ImageObject[] | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [imageNumber, setImageNumber] = useState(DEFAULT_IMAGE_NUMBER);

  const [animatingIn, setAnimatingIn] = useState(false);
  const [animatingOut, setAnimatingOut] = useState(false);

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
    async (numberOfImages?: number) => {
      if (loading || promptText.trim().length === 0) {
        return;
      }

      const newImageCount = numberOfImages ?? parseInt(imageNumber, 10);

      const oldImages = [...(images ?? [])];
      const newImageIds = new Array(newImageCount).fill("").map(() => uuid());

      if (numberOfImages) {
        setImages([
          ...oldImages,
          ...newImageIds.map((id) => ({
            id,
          })),
        ]);
      }

      setErrorMessage("");
      setLoading("service");
      const { data, errors } = await serviceModule.openaiCreateImage({
        data: {
          prompt: promptText,
          n: numberOfImages ?? parseInt(imageNumber, 10),
        },
      });

      if (!data || errors) {
        setErrorMessage(
          errors?.[0]?.message ?? "Could not contact OpenAI's image service",
        );
        setImages(oldImages);
        setLoading(false);
        return;
      }

      const generatedImageUrls = data.data
        .map(({ url }) => url)
        .filter((url): url is string => !!url);

      if (!numberOfImages) {
        setAnimatingIn(true);
      }

      setImages([
        ...oldImages,
        ...generatedImageUrls.map((url, index) => ({
          id: newImageIds[index]!,
          url,
        })),
      ]);

      try {
        setLoading("upload");
        const uploadedEntities = await Promise.all(
          generatedImageUrls.map((url) =>
            graphModule
              .uploadFile({
                data: { description: promptText, url },
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

        const uploadedImages = uploadedEntities
          .map((entity) => ({
            entityId: entity.metadata.recordId.entityId,
            date: entity.metadata.recordId.editionId,
            url: entity.properties[urlKey],
          }))
          .filter(({ url }) => !!url);

        setImages([
          ...oldImages,
          ...uploadedImages.map(({ entityId, date, url }, index) => ({
            id: newImageIds[index]!,
            entityId,
            date,
            url,
          })),
        ]);
      } catch (err) {
        setErrorMessage(
          `Could not upload images: ${
            err instanceof Error ? err.message : "unknown error"
          }`,
        );
        setImages(oldImages);
        setLoading(false);
      }

      setLoading(false);
      inputRef.current?.blur();
    },
    [imageNumber, promptText, serviceModule, graphModule, images, loading],
  );

  const onSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      await generateAndUploadImages();
    },
    [generateAndUploadImages],
  );

  return (
    <Box
      ref={blockRootRef}
      style={{ fontFamily: "colfax-web", fontWeight: 400 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Fade
        in={
          hovered ||
          inputFocused ||
          animatingIn ||
          animatingOut ||
          (isMobile && mobileSettingsExpanded)
        }
      >
        <Box sx={{ display: "flex", columnGap: 3, flexWrap: "wrap", mb: 1.5 }}>
          <GetHelpLink href="https://blockprotocol.org/@hash/blocks/ai-image" />

          {isMobile ? (
            <BlockSettingsButton
              expanded={mobileSettingsExpanded}
              onClick={() => setMobileSettingsExpanded(!mobileSettingsExpanded)}
            />
          ) : null}

          <Collapse in={!isMobile || mobileSettingsExpanded}>
            <Box display="flex" gap={1} flexWrap="wrap" mt={isMobile ? 1 : 0}>
              <Typography
                variant="regularTextLabels"
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  textDecoration: "none",
                  fontSize: 15,
                  lineHeight: 1,
                  letterSpacing: -0.02,

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

              {!images?.length ? (
                <ImageNumberSelector
                  open={selectorOpen}
                  onOpen={() => setSelectorOpen(true)}
                  onClose={() => setSelectorOpen(false)}
                  value={imageNumber}
                  onChange={setImageNumber}
                />
              ) : null}
            </Box>
          </Collapse>
        </Box>
      </Fade>

      <Collapse
        in={!images?.length && !animatingIn}
        onEntered={() => setAnimatingOut(false)}
        onExited={() => setAnimatingIn(false)}
      >
        <form onSubmit={onSubmit}>
          <TextField
            autoFocus
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
            disabled={!!loading}
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
                  disabled={!!loading}
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
                    whiteSpace: "nowrap",
                    [`&.${buttonBaseClasses.disabled}`]: {
                      color: palette.common.black,
                      background: "none",
                    },
                  })}
                >
                  {loading === "service" ? (
                    <>
                      GENERATING <BouncingDotsLoader />
                    </>
                  ) : loading === "upload" ? (
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

          <Collapse in={!!errorMessage}>
            <BlockErrorMessage apiName="OpenAI" sx={{ mt: 1 }} />
          </Collapse>
        </form>
      </Collapse>

      <Collapse
        in={!!images?.length && !animatingOut && !animatingIn}
        onExited={() => setImages(null)}
      >
        {images && (
          <ImagePreview
            onConfirm={(entityId) => {
              confirm(entityId);
            }}
            onDiscard={() => {
              setAnimatingOut(true);
              inputRef.current?.focus();
            }}
            images={images}
            prompt={promptText}
            loading={!!loading}
            generateAdditionalImages={(numberOfImages) =>
              generateAndUploadImages(numberOfImages)
            }
            errorMessage={errorMessage}
          />
        )}
      </Collapse>
    </Box>
  );
};
