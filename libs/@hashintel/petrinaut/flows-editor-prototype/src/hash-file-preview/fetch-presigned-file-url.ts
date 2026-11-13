/**
 * Stands in for HASH's `fetch-presigned-file-url.ts` (apps/hash-frontend/src/pages/shared), which asks the HASH API
 * for a presigned URL. The prototype's PDFs are plain files in public/files, so the URL is already fetchable.
 *
 * MOCK: no API.
 */
export const fetchPresignedFileUrl = async (fileUrl: string): Promise<string> =>
  Promise.resolve(fileUrl);
