/**
 * The API normally handles file downloads by:
 * 1. Accepting a request with a cookie
 * 2. Checking if the authenticated user can access the file
 * 3. Automatically redirecting the request to a presigned URL to fetch the file
 *
 * This doesn't work for JS fetch because the request to the redirected URL will have origin: null,
 * which the object storage's CORS headers don't permit (at least in our deployed configuration).
 * So we instead ask the API for the presigned URL only, and fetch the file from that.
 */
export const fetchPresignedFileUrl = async (
  fileUrl: string,
): Promise<string> => {
  const response = await fetch(`${fileUrl}?urlOnly=true`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(
      `Requesting a download URL for ${fileUrl} failed with HTTP ${response.status}`,
    );
  }

  const body: unknown = await response.json();

  if (
    typeof body !== "object" ||
    body === null ||
    !("url" in body) ||
    typeof body.url !== "string"
  ) {
    throw new Error(`The download URL response for ${fileUrl} has no url`);
  }

  return body.url;
};
