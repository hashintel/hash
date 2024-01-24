export const fetchFileActivity = async (params: { url: string }) => {
  const response = await fetch(params.url);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();

  const fileBuffer = Buffer.from(arrayBuffer);

  /**
   * We need to serialize the buffer, because passing the raw buffer
   * between activities results in the buffer being malformed for
   * some reason.
   *
   * @todo: figure out why this is happening
   */
  const stringifiedFileBuffer = fileBuffer.toString("base64");

  return { stringifiedFileBuffer };
};
