import type { JsonValue } from "@blockprotocol/type-system";
import type {
  FileDataPart,
  FunctionCallPart,
  FunctionResponsePart,
  Part,
  TextPart,
} from "@google-cloud/vertexai";

import { useFileSystemPathFromEntity } from "../../use-file-system-file-from-url.js";
import type { LlmMessage } from "../llm-message.js";
import { uploadFileToGcpStorage } from "./google-cloud-storage.js";

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
          } satisfies FileDataPart;

          return uploadedFileData;
        },
      );
    }
    case "text": {
      return {
        text: content.text,
      } satisfies TextPart;
    }
    case "tool_result": {
      try {
        const parsedContent = JSON.parse(content.content) as JsonValue;

        if (typeof parsedContent !== "object" || parsedContent === null) {
          throw new Error("Parsed content is not an object");
        }

        return {
          functionResponse: {
            name: content.tool_use_id,
            response: parsedContent,
          },
        } satisfies FunctionResponsePart;
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
          args: content.input,
        },
      } satisfies FunctionCallPart;
    }
  }
};
