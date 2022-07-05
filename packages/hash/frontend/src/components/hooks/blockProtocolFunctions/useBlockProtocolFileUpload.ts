import { EmbedderGraphMessageCallbacks } from "@blockprotocol/graph";
import { isFileProperties } from "@hashintel/hash-shared/util";
import {
  GetEntityQuery,
  GetEntityQueryVariables,
} from "@hashintel/hash-shared/graphql/apiTypes.gen";
import { getEntity } from "@hashintel/hash-shared/queries/entity.queries";
import { useApolloClient, useMutation } from "@apollo/client";
import { useCallback } from "react";
import * as SparkMD5 from "spark-md5";
import {
  CreateFileFromLinkMutationVariables,
  CreateFileFromLinkMutation,
  RequestFileUploadMutation,
  RequestFileUploadMutationVariables,
  RequestFileUploadResponse,
} from "../../../graphql/apiTypes.gen";
import {
  createFileFromLink,
  requestFileUpload,
} from "../../../graphql/queries/file.queries";

// https://dev.to/qortex/compute-md5-checksum-for-a-file-in-typescript-59a4

function computeChecksumMd5(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunkSize = 2097152; // Read in chunks of 2MB
    const spark = new SparkMD5.ArrayBuffer();
    const fileReader = new FileReader();

    let cursor = 0;

    function processChunk(chunkStart: number) {
      const chunkEnd = Math.min(file.size, chunkStart + chunkSize);
      fileReader.readAsArrayBuffer(file.slice(chunkStart, chunkEnd));
    }

    fileReader.onload = (evt: ProgressEvent<FileReader>) => {
      if (!evt.target?.result) return;
      spark.append(evt.target.result as ArrayBuffer);
      cursor += chunkSize;

      if (cursor < file.size) {
        processChunk(cursor);
      } else {
        resolve(spark.end());
      }
    };

    fileReader.onerror = () => {
      reject(
        new Error(
          "An error occurred generating the md5 checksum during file upload",
        ),
      );
    };

    processChunk(0);
  });
}

export const useBlockProtocolFileUpload = (accountId: string) => {
  const client = useApolloClient();

  const [requestFileUploadFn] = useMutation<
    RequestFileUploadMutation,
    RequestFileUploadMutationVariables
  >(requestFileUpload);

  const [createFileFromLinkFn] = useMutation<
    CreateFileFromLinkMutation,
    CreateFileFromLinkMutationVariables
  >(createFileFromLink);

  const uploadFileToStorageProvider = async (
    presignedPostData: RequestFileUploadResponse["presignedPost"],
    file: File,
  ) => {
    const formData = new FormData();
    const { url, fields } = presignedPostData;

    Object.entries(fields).forEach(([key, val]) => {
      formData.append(key, val as string);
    });

    formData.append("file", file);

    return await fetch(url, {
      method: "POST",
      body: formData,
    });
  };

  const uploadFile: EmbedderGraphMessageCallbacks["uploadFile"] = useCallback(
    async ({ data }) => {
      if (!data) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "'data' must be provided for uploadFile",
            },
          ],
        };
      }

      const { file, url, mediaType } = data;

      if (url?.trim() && accountId) {
        const { data: responseData } = await createFileFromLinkFn({
          variables: {
            accountId,
            name: url,
            url,
          },
        });

        if (!responseData) {
          return {
            errors: [
              {
                code: "INVALID_INPUT",
                message: "Error calling uploadFile",
              },
            ],
          };
        }

        const {
          createFileFromLink: { entityId: fileEntityId, properties },
        } = responseData;

        return {
          data: {
            entityId: fileEntityId,
            url: properties.url,
            mediaType,
            accountId,
          },
        };
      }

      if (!file) {
        throw new Error(
          `Please enter a valid ${mediaType} 'url' or provide a 'file'`,
        );
      }

      const contentMd5 = await computeChecksumMd5(file);

      const { data: responseData } = await requestFileUploadFn({
        variables: {
          name: file.name,
          size: file.size,
          contentMd5,
        },
      });

      if (!responseData) {
        return {
          errors: [
            {
              code: "INVALID_INPUT",
              message: "Error calling uploadFile",
            },
          ],
        };
      }

      /**
       * Upload file with presignedPost data to S3
       */
      const {
        requestFileUpload: { presignedPost, file: uploadedFileEntity },
      } = responseData;

      await uploadFileToStorageProvider(presignedPost, file);

      /**
       * Fetch File Entity to get Url
       */
      const response = await client.query<
        GetEntityQuery,
        GetEntityQueryVariables
      >({
        query: getEntity,
        variables: {
          accountId: uploadedFileEntity.accountId,
          entityId: uploadedFileEntity.entityId,
        },
      });

      const { properties } = response.data.entity;

      if (!isFileProperties(properties)) {
        throw new Error("Expected file entity in response");
      }

      return {
        accountId: uploadedFileEntity.accountId,
        entityId: uploadedFileEntity.entityId,
        url: properties.url,
        mediaType,
      };
    },
    [accountId, client, createFileFromLinkFn, requestFileUploadFn],
  );

  return {
    uploadFile,
  };
};
