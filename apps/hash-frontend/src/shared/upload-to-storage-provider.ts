import { RequestFileUploadResponse } from "../graphql/api-types.gen";

export const uploadFileToStorageProvider = async (
  presignedPostData: RequestFileUploadResponse["presignedPost"],
  file: File,
  onProgress?: (progress: number) => void,
) => {
  const formData = new FormData();
  const { url, fields } = presignedPostData;

  for (const [key, val] of Object.entries(fields)) {
    formData.append(key, val as string);
  }

  formData.append("file", file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);

    if (onProgress) {
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          const progress = (event.loaded / event.total) * 100;
          onProgress(progress);
        }
      });
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.statusText);
      } else {
        reject(new Error(xhr.statusText || "Request failed."));
      }
    };

    xhr.onerror = () => {
      reject(new Error(xhr.statusText || "Network error."));
    };

    xhr.send(formData);
  });
};
