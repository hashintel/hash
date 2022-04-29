import { TDDocument, TDExport, TldrawApp } from "@tldraw/tldraw";

/**
 * @todo implement endpoint for handling image exports
 * This only handles svg exports at the moment
 * @see https://github.com/tldraw/tldraw/blob/main/apps/www/utils/export.ts
 * @see https://github.com/tldraw/tldraw/blob/main/apps/www/pages/api/export.ts
 */

export async function handleExport(info: TDExport) {
  if (info.serialized) {
    const link = document.createElement("a");
    link.href = `data:text/plain;charset=utf-8,${encodeURIComponent(
      info.serialized,
    )}`;
    link.download = `${info.name}.${info.type}`;
    link.click();
  }
}

export const getInitialDocument = (document: string | undefined, entityId) => {
  try {
    return JSON.parse(document) as TDDocument;
  } catch (err) {
    return {
      id: entityId,
      name: "New Document",
      version: TldrawApp.version,
      pages: {
        page: {
          id: "page",
          name: "Page 1",
          childIndex: 1,
          shapes: {},
          bindings: {},
        },
      },
      assets: {},
      pageStates: {
        page: {
          id: "page",
          selectedIds: [],
          camera: {
            point: [0, 0],
            zoom: 1,
          },
        },
      },
    };
  }
};
