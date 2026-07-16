import { useFileSystemPathFromEntity } from "../../use-file-system-file-from-url.js";
import { uploadFileToGcpStorage } from "./google-cloud-storage.js";

import type { LlmMessage } from "../llm-message.js";
import type { PropertyValue } from "@blockprotocol/type-system";
import type { Part } from "@google/genai";

export const mapLlmContentToGooglePartAndUploadFiles = async (
  content: LlmMessage["content"][number],
): Promise<Part> => {
  switch (content.type) {
    case "file": {
      const { fileEntity } = content;

      return await useFileSystemPathFromEntity(
        fileEntity,
        async ({ fileSystemPath }) => {
          const { gcpStorageUri } = await uploadFileToGcpStorage({
            fileEntity,
            fileSystemPath,
          });

          const mimeType =
            fileEntity.properties[
              "https://blockprotocol.org/@blockprotocol/types/property-type/mime-type/"
            ];

          if (!mimeType) {
            throw new Error(
              `File entity with entityId ${fileEntity.entityId} does not have a mimeType property`,
            );
          }

          const uploadedFileData = {
            fileData: {
              fileUri: gcpStorageUri,
              mimeType,
            },
          } satisfies Part;

          return uploadedFileData;
        },
      );
    }
    case "text": {
      return {
        text: content.text,
      } satisfies Part;
    }
    case "tool_result": {
      try {
        const parsedContent = JSON.parse(content.content) as PropertyValue;

        if (typeof parsedContent !== "object" || parsedContent === null) {
          throw new Error("Parsed content is not an object");
        }

        return {
          functionResponse: {
            name: content.tool_use_id,
            response: parsedContent as Record<string, unknown>,
          },
        } satisfies Part;
      } catch {
        throw new Error(
          `Failed to parse tool result content: ${content.content}`,
        );
      }
    }
    case "tool_use": {
      return {
        functionCall: {
          name: content.name,
          args: content.input as Record<string, unknown>,
        },
      } satisfies Part;
    }
    case "thinking":
    case "redacted_thinking": {
      throw new Error(
        "Anthropic thinking content is not supported for Google AI calls",
      );
    }
  }
};
