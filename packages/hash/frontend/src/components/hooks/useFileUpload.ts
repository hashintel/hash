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

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "multipart/form-data",
      },
      body: formData,
    });
    return await response.json();
  };

  //   @todo ask how we handle urls. Do we just save that to db?
  const uploadFile = useCallback(
    async ({ file }: { file?: File; url?: string; mime?: string }) => {
      // should this always expect a file
      if (!file) return;
      try {
        //
        const contentMd5 = await computeChecksumMd5(file);

        const { data } = await requestFileUploadFn({
          variables: {
            name: file.name,
            size: file.size,
            contentMd5,
          },
        });

        // @todo handle errors
        if (!data) {
          return;
        }

        //
        const {
          requestFileUpload: {
            presignedPost,
            file: { entityId },
          },
        } = data;

        await uploadFileToS3(presignedPost, file);

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
        console.log("properties ==> ", properties);
        return { src: properties.url };
      } catch (err) {
        console.log("err ==> ", err);
        throw err;
      }
    },
    [],
  );

  return {
    uploadFile,
  };
};
