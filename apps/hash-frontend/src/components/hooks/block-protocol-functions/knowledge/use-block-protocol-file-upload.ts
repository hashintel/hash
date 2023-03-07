import { useMutation } from "@apollo/client";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
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

export const useBlockProtocolFileUpload = (
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

  const uploadFile: UploadFileRequestCallback = useCallback(
    async ({ data: fileUploadData }) => {
      const { file, url, mediaType } = fileUploadData ?? {
        mediaType: "image",
      };
      if (url?.trim()) {
        const result = await createFileFromUrlFn({
          variables: {
            url,
            mediaType,
          },
        });

        if (!result.data) {
          throw new Error(
            "An error occured while creating a file from an external link",
          );
        }

        const {
          createFileFromUrl: {
            metadata: { recordId },
          },
        } = result.data;

        return {
          entityId: recordId.entityId,
          url,
          mediaType,
        };
      }

      if (!file) {
        throw new Error(`Please provide a valid file to be uploaded`);
      }

      const { data } = await requestFileUploadFn({
        variables: {
          size: file.size,
          mediaType,
        },
      });

      if (!data) {
        throw new Error("An error occurred while uploading the file ");
      }

      /**
       * Upload file with presignedPost data to S3
       */
      const {
        requestFileUpload: { presignedPost, entity: uploadedFileEntity },
      } = data;

      await uploadFileToStorageProvider(presignedPost, file);

      const uploadedFileUrl = uploadedFileEntity.properties[
        extractBaseUrl(types.propertyType.fileUrl.propertyTypeId)
      ] as string;

      return {
        data: {
          entityId: uploadedFileEntity.metadata.recordId.entityId,
          url: uploadedFileUrl,
          mediaType,
        },
      };
    },
    [createFileFromUrlFn, requestFileUploadFn],
  );

  return {
    uploadFile,
  };
};
