import { EmbedderGraphMessageCallbacks } from "@blockprotocol/graph/.";
import * as SparkMD5 from "spark-md5";

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
): { uploadFile: EmbedderGraphMessageCallbacks["uploadFile"] } => {
  return {
    uploadFile: (_) => {
      throw new Error("File uploading is not implemented.");
    },
  };
};
