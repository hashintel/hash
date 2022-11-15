import { TDDocument, TDExport, TldrawApp } from "@tldraw/tldraw";

/**
 * @todo implement endpoint for handling image exports
 * This only handles svg exports at the moment
 * @see https://github.com/tldraw/tldraw/blob/main/apps/www/utils/export.ts
 * @see https://github.com/tldraw/tldraw/blob/main/apps/www/pages/api/export.ts
 */

export const handleExport = async (
  _: TldrawApp,
  info: TDExport,
  // eslint-disable-next-line @typescript-eslint/require-await -- @tldraw/tldraw types define onExport as async
): Promise<void> => {
  const blobUrl = URL.createObjectURL(info.blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = `${info.name}.${info.type}`;
  link.click();
};

// @todo improve this
export const isValidSerializedDocument = (
  serializedDocument: string | undefined,
): serializedDocument is string => {
  if (typeof serializedDocument !== "string") return false;
  try {
    JSON.parse(serializedDocument);
    return true;
  } catch (err) {
    return false;
  }
};

export const getDefaultDocument = (entityId: string): TDDocument => {
  return {
    ...TldrawApp.defaultDocument,
    id: entityId,
  };
};

/**
 * Parses the document string to return a TDD document
 * If the document is undefined or invalid, it returns a
 * default TDD document with it's id set to entityId
 */
export const getInitialDocument = (
  serializedDocument: string | undefined,
  entityId: string,
): TDDocument => {
  return isValidSerializedDocument(serializedDocument)
    ? (JSON.parse(serializedDocument) as TDDocument)
    : getDefaultDocument(entityId);
};
