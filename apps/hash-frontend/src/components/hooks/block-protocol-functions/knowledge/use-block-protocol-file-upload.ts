import { useMutation } from "@apollo/client";
import { File as FileEntityType } from "@local/hash-isomorphic-utils/system-types/file";
import { OwnedById } from "@local/hash-subgraph";
import { useCallback } from "react";

import {
  CreateFileFromUrlMutation,
  CreateFileFromUrlMutationVariables,
  RequestFileUploadMutation,
  RequestFileUploadMutationVariables,
  RequestFileUploadResponse,
} from "../../../../graphql/api-types.gen";
import {
  createFileFromUrl,
  requestFileUpload,
} from "../../../../graphql/queries/knowledge/file.queries";
import { UploadFileRequestCallback } from "./knowledge-shim";

const uploadFileToStorageProvider = async (
  presignedPostData: RequestFileUploadResponse["presignedPost"],
  file: File,
) => {
  const formData = new FormData();
  const { url, fields } = presignedPostData;

  for (const [key, val] of Object.entries(fields)) {
    formData.append(key, val as string);
  }

  formData.append("file", file);

  return await fetch(url, {
    method: "POST",
    body: formData,
  });
};

export const useBlockProtocolFileUpload = (
  ownedById?: OwnedById,
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
      if (!ownedById) {
        throw new Error("No ownedById provided for uploadFile");
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
        const { description, entityTypeId, name, url } = fileUploadData;
        const result = await createFileFromUrlFn({
          variables: {
            description,
            entityTypeId,
            ownedById,
            displayName: name,
            url,
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

        return { data: fileEntity as unknown as FileEntityType };
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

      const { description, entityTypeId, name, file } = fileUploadData;

      const { data } = await requestFileUploadFn({
        variables: {
          description,
          entityTypeId,
          ownedById,
          displayName: name,
          name: file.name,
          size: file.size,
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
        requestFileUpload: { presignedPost, entity: uploadedFileEntity },
      } = data;

      await uploadFileToStorageProvider(presignedPost, file);

      return { data: uploadedFileEntity as unknown as FileEntityType };
    },
    [createFileFromUrlFn, ownedById, requestFileUploadFn],
  );

  return {
    uploadFile,
  };
};
