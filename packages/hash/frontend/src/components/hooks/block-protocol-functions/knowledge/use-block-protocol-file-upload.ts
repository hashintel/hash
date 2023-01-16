import { useMutation } from "@apollo/client";
import { extractBaseUri } from "@blockprotocol/type-system";
import { types } from "@hashintel/hash-shared/ontology-types";
import { EntityId } from "@hashintel/hash-shared/types";
import { useCallback } from "react";
import * as SparkMD5 from "spark-md5";

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

// https://dev.to/qortex/compute-md5-checksum-for-a-file-in-typescript-59a4

function _computeChecksumMd5(file: File): Promise<string> {
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
      if (!evt.target?.result) {
        return;
      }
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
            metadata: { editionId },
          },
        } = result.data;

        return {
          entityId: editionId.baseId as EntityId,
          url,
          mediaType,
        };
      }

      if (!file) {
        throw new Error(`Please provide a valid file to be uploaded`);
      }

      // const contentMd5 = await computeChecksumMd5(file);

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
        extractBaseUri(types.propertyType.fileUrl.propertyTypeId)
      ] as string;

      return {
        data: {
          entityId: uploadedFileEntity.metadata.editionId.baseId as EntityId,
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
