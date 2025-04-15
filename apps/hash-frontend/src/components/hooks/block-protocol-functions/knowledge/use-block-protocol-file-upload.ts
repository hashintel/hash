import { useMutation } from "@apollo/client";
import type { WebId } from "@blockprotocol/type-system";
import { Entity } from "@local/hash-graph-sdk/entity";
import type { File } from "@local/hash-isomorphic-utils/system-types/shared";
import { useCallback } from "react";

import type {
  CreateFileFromUrlMutation,
  CreateFileFromUrlMutationVariables,
  RequestFileUploadMutation,
  RequestFileUploadMutationVariables,
} from "../../../../graphql/api-types.gen";
import {
  createFileFromUrl,
  requestFileUpload,
} from "../../../../graphql/queries/knowledge/file.queries";
import { uploadFileToStorageProvider } from "../../../../shared/upload-to-storage-provider";
import type { UploadFileRequestCallback } from "./knowledge-shim";

export const useBlockProtocolFileUpload = (
  webId?: WebId,
  _readonly?: boolean,
): { uploadFile: UploadFileRequestCallback } => {
  const [requestFileUploadFn] = useMutation<
    RequestFileUploadMutation,
    RequestFileUploadMutationVariables
  >(requestFileUpload);

  const [createFileFromUrlFn] = useMutation<
    CreateFileFromUrlMutation,
    CreateFileFromUrlMutationVariables
  >(createFileFromUrl);

  const uploadFile: UploadFileRequestCallback = useCallback(
    async ({ data: fileUploadData }) => {
      if (!webId) {
        throw new Error("No webId provided for uploadFile");
      }
      if (!fileUploadData) {
        return {
          errors: [
            {
              message: "You must provide data with a file upload",
              code: "INVALID_INPUT",
            },
          ],
        };
      }
      if ("url" in fileUploadData && fileUploadData.url.trim()) {
        const { description, name, url } = fileUploadData;
        const result = await createFileFromUrlFn({
          variables: {
            description,
            displayName: name,
            url,
            ...("fileEntityUpdateInput" in fileUploadData
              ? { fileEntityUpdateInput: fileUploadData.fileEntityUpdateInput }
              : {
                  fileEntityCreationInput: {
                    webId,
                    ...fileUploadData.fileEntityCreationInput,
                  },
                }),
          },
        });

        if (!result.data) {
          return {
            errors: [
              {
                message:
                  "An error occurred while creating a file from an external link",
                code: "INTERNAL_ERROR",
              },
            ],
          };
        }

        const { createFileFromUrl: fileEntity } = result.data;

        return { data: new Entity<File>(fileEntity) };
      }

      if (!("file" in fileUploadData)) {
        return {
          errors: [
            {
              message: "Please provide a valid file to be uploaded",
              code: "INVALID_INPUT",
            },
          ],
        };
      }

      const { description, name, file } = fileUploadData;

      const { data } = await requestFileUploadFn({
        variables: {
          description,
          displayName: name,
          name: file.name,
          size: file.size,
          ...("fileEntityUpdateInput" in fileUploadData
            ? { fileEntityUpdateInput: fileUploadData.fileEntityUpdateInput }
            : {
                fileEntityCreationInput: {
                  webId,
                  ...fileUploadData.fileEntityCreationInput,
                },
              }),
        },
      });

      if (!data) {
        return {
          errors: [
            {
              message: "An error occurred while uploading the file",
              code: "INTERNAL_ERROR",
            },
          ],
        };
      }

      /**
       * Upload file with presignedPost data to storage provider
       */
      const {
        requestFileUpload: { presignedPut, entity: uploadedFileEntity },
      } = data;

      await uploadFileToStorageProvider(presignedPut, file);

      return { data: new Entity<File>(uploadedFileEntity) };
    },
    [createFileFromUrlFn, webId, requestFileUploadFn],
  );

  return {
    uploadFile,
  };
};
