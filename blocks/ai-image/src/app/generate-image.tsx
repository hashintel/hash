import { RemoteFileEntity } from "@blockprotocol/graph";
import { useGraphBlockModule } from "@blockprotocol/graph/react";
import { useServiceBlockModule } from "@blockprotocol/service/react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

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
        entityTypeId:
          "https://blockprotocol-87igvkbkw.stage.hash.ai/@ciaranm/types/entity-type/generatedimage/v/1",
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
      if (loading) {
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
      <link rel="stylesheet" href="https://use.typekit.net/igj4jff.css" />
      <form onSubmit={generateAndUploadImages}>
        <label>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 10 }}>
            DESCRIBE THE IMAGE TO GENERATE
          </div>
          <input
            onChange={(event) => setPromptText(event.target.value)}
            placeholder="Enter a prompt to generate images"
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
              width: 320,
              maxWidth: "100%",
            }}
            value={promptText}
          />
        </label>
        {promptText.trim().length > 0 && (
          <button
            disabled={loading}
            style={{
              background: loading
                ? "#0059A5"
                : images
                ? "rgba(221, 231, 240, 1)"
                : "#0775E3",
              borderRadius: 10,
              boxShadow:
                "0px 4px 11px rgba(39, 50, 86, 0.04), 0px 2.59259px 6.44213px rgba(39, 50, 86, 0.08), 0px 0.5px 1px rgba(39, 50, 86, 0.15)",
              color: loading
                ? "rgba(180, 226, 253, 1)"
                : images
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
              : uploadInProgress
              ? "UPLOADING..."
              : images
              ? "GENERATED"
              : "GENERATE IMAGE"}
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
            {errorMessage}
          </div>
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
