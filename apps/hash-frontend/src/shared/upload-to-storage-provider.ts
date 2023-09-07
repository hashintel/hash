import { RequestFileUploadResponse } from "../graphql/api-types.gen";

export const uploadFileToStorageProvider = async (
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
