import {
  GetEntityQuery,
  GetEntityQueryVariables,
} from "@hashintel/hash-shared/graphql/apiTypes.gen";
import { getEntity } from "@hashintel/hash-shared/queries/entity.queries";
import { useApolloClient, useMutation } from "@apollo/client";
import { useCallback } from "react";
import * as SparkMD5 from "spark-md5";
import {
  RequestFileUploadMutation,
  RequestFileUploadMutationVariables,
  RequestFileUploadResponse,
} from "../../graphql/apiTypes.gen";
import { requestFileUpload } from "../../graphql/queries/file.queries";

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
      reject(new Error("An error occured"));
    };

    processChunk(0);
  });
}

export const useFileUpload = (accountId: string) => {
  const client = useApolloClient();

  const [requestFileUploadFn] = useMutation<
    RequestFileUploadMutation,
    RequestFileUploadMutationVariables
  >(requestFileUpload);

  const uploadFileToS3 = async (
    presignedPostData: RequestFileUploadResponse["presignedPost"],
    file: File,
  ) => {
    const formData = new FormData();
    const { url, fields } = presignedPostData;

    Object.entries(fields).forEach(([key, val]) => {
      formData.append(key, val as string);
    });

    formData.append("file", file);

    await fetch(url, {
      method: "POST",
      body: formData,
    });
  };

  //   @todo ask how we handle urls. Do we just save that to db?
  const uploadFile = useCallback(
    async (args: { file?: File; url?: string; mime?: string }) => {
      const { file, url, mime } = args;

      /**
       * For external urls, we temporarily return the url for now
       * The proper flow will be addressed in
       * https://app.asana.com/0/1201214243372255/1201329437863863/f
       */
      if (url?.trim()) {
        return { src: url };
      }

      if (!file) {
        let fileType = "";

        if (mime?.includes("image")) {
          fileType = "Image";
        }

        if (mime?.includes("video")) {
          fileType = "Video";
        }

        throw new Error(
          `Please enter a valid  ${
            fileType ? `${fileType} ` : ""
          }URL or select a file below`,
        );
      }

      try {
        const contentMd5 = await computeChecksumMd5(file);

        const { data } = await requestFileUploadFn({
          variables: {
            name: file.name,
            size: file.size,
            contentMd5,
          },
        });

        if (!data) {
          throw new Error("An error occured");
        }

        /**
         * Upload file with presignedPost data to S3
         */
        const {
          requestFileUpload: {
            presignedPost,
            file: { entityId },
          },
        } = data;

        await uploadFileToS3(presignedPost, file);

        /**
         * Fetch File Entity to get Url
         */
        const response = await client.query<
          GetEntityQuery,
          GetEntityQueryVariables
        >({
          query: getEntity,
          variables: {
            accountId,
            entityId,
          },
        });

        const { properties } = response.data.entity;
        return { src: properties.url };
      } catch (err) {
        throw err;
      }
    },
    [],
  );

  return {
    uploadFile,
  };
};
