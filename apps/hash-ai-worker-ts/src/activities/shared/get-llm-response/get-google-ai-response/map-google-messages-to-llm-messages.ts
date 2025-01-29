import type { Content } from "@google-cloud/vertexai";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { File } from "@local/hash-isomorphic-utils/system-types/shared";

import type { LlmMessage } from "../llm-message.js";
import { getFileEntityFromGcpStorageUri } from "./google-cloud-storage.js";

export const mapGoogleMessagesToLlmMessages = (params: {
  messages: Content[];
  fileEntities: Pick<Entity<File>, "entityId" | "properties">[];
}): LlmMessage[] => {
  const { messages, fileEntities } = params;

  return messages.map((message) => {
    if (message.role === "user") {
      return {
        role: message.role,
        content: message.parts.map((part) => {
          if ("functionResponse" in part) {
            if (!part.functionResponse) {
              throw new Error("Function response is undefined");
            }

            return {
              type: "tool_result" as const,
              tool_use_id: part.functionResponse.name,
              name: part.functionResponse.name,
              content: JSON.stringify(part.functionResponse.response),
            };
          }

          if ("text" in part) {
            if (typeof part.text !== "string") {
              throw new Error("Text is not a string");
            }

            return {
              type: "text" as const,
              text: part.text,
            };
          }

          if ("fileData" in part) {
            if (!part.fileData) {
              throw new Error("File data is undefined");
            }

            const { entityId, properties } = getFileEntityFromGcpStorageUri({
              fileEntities,
              gcpStorageUri: part.fileData.fileUri,
            });

            return {
              type: "file" as const,
              fileEntity: {
                entityId,
                properties,
              },
            };
          }

          throw new Error(
            `Unexpected content type for 'user' message: ${JSON.stringify(part)}`,
          );
        }),
      };
    } else if (message.role === "assistant") {
      return {
        role: message.role,
        content: message.parts.map((part) => {
          if ("functionCall" in part) {
            if (!part.functionCall) {
              throw new Error("Function call is undefined");
            }

            return {
              type: "tool_use" as const,
              id: part.functionCall.name,
              name: part.functionCall.name,
              input: part.functionCall.args,
            };
          }

          if ("text" in part) {
            if (typeof part.text !== "string") {
              throw new Error("Text is not a string");
            }

            return {
              type: "text" as const,
              text: part.text,
            };
          }

          throw new Error(
            `Unexpected content type for 'assistant' message: ${JSON.stringify(part)}`,
          );
        }),
      };
    }

    throw new Error(`Unexpected message role: ${message.role}`);
  });
};
