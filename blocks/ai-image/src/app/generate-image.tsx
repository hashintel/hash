import { RemoteFileEntity } from "@blockprotocol/graph";
import { useGraphBlockModule } from "@blockprotocol/graph/react";
import { useServiceBlockModule } from "@blockprotocol/service/react";
import { Button, TextField } from "@hashintel/design-system";
import { inputBaseClasses, Typography } from "@mui/material";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { generatedLinkKey } from "../app";
import { ArrowTurnDownLeftIcon } from "../icons/arrow-turn-down-left";
import { RootEntity } from "../types";
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

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [promptText, setPromptText] = useState("");
  const [images, setImages] = useState<
    ImageObject[] | RemoteFileEntity[] | null
  >(null);

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
    <div
      ref={blockRootRef}
      style={{ fontFamily: "colfax-web", fontWeight: 400 }}
    >
      <form onSubmit={generateAndUploadImages}>
        <TextField
          onChange={(event) => setPromptText(event.target.value)}
          placeholder="Enter a prompt to generate image, and hit enter"
          required
          ref={inputRef}
          sx={{
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
          }}
          InputProps={{
            endAdornment: (
              <Button
                type="submit"
                variant="tertiary_quiet"
                disabled={loading || uploadInProgress}
                sx={{
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  lineHeight: 1,
                  color: ({ palette }) => palette.blue[70],
                  textTransform: "uppercase",
                  height: 1,
                  width: 1,
                  maxWidth: 168,
                  mr: 0.25,
                  minHeight: 51,
                }}
              >
                {loading ? (
                  "GENERATING ..."
                ) : uploadInProgress ? (
                  "UPLOADING ..."
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

      {images && (
        <ImagePreview
          onConfirm={(image) => {
            confirm(image.metadata.recordId.entityId);
          }}
          onDiscard={() => {
            setImages(null);
            inputRef.current?.focus();
          }}
          images={images}
          prompt={promptText}
          uploadInProgress={!!uploadInProgress}
        />
      )}
    </div>
  );
};
