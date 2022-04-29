/* eslint-disable no-param-reassign */
import { TldrawApp, TDDocument, Tldraw } from "@tldraw/tldraw";
import React, { FC, useCallback, useEffect, useRef } from "react";
import { getInitialDocument, handleExport } from "./utils";

type Props = {
  document: string;
  entityId: string;
  darkMode: boolean;
  readOnly: boolean;
  updateRemoteData: ({ document }: { document: string }) => void;
};

export const Editor: FC<Props> = React.memo(
  ({ document, entityId, darkMode, readOnly, updateRemoteData }) => {
    const rTldrawApp = useRef<TldrawApp>();
    const rInitialDocument = useRef<TDDocument>(
      getInitialDocument(document, entityId),
    );

    const handleMount = useCallback(
      (app: TldrawApp) => {
        rTldrawApp.current = app;

        if (darkMode !== rTldrawApp.current.settings.isDarkMode) {
          rTldrawApp.current.toggleDarkMode();
        }
      },
      [darkMode],
    );

    const handlePersist = useCallback(
      (app: TldrawApp) => {
        const newDocument = app.document;
        // ensure document's id is set to entityId on save
        newDocument.id = entityId;

        updateRemoteData({
          document: JSON.stringify(newDocument),
        });
      },
      [entityId, updateRemoteData],
    );

    useEffect(() => {
      try {
        if (!rTldrawApp.current) return;
        const remoteDocument = JSON.parse(document) as TDDocument;
        const app = rTldrawApp.current;

        // update document if its id hasn't changed. load document if it has
        if (remoteDocument.id && remoteDocument.id === entityId) {
          app.updateDocument(remoteDocument);
        } else {
          // saved documents should have an id which points to the entityId supplied.
          if (!remoteDocument.id) remoteDocument.id = entityId;
          app.loadDocument(remoteDocument);
          app.zoomToFit();
        }

        if (darkMode !== app.settings.isDarkMode) {
          app.toggleDarkMode();
        }
      } catch (err) {
        // todo handle error
      }
    }, [document, entityId, darkMode]);

    console.log("re-rendered");

    return (
      <Tldraw
        document={rInitialDocument.current}
        onMount={handleMount}
        onPersist={handlePersist}
        readOnly={readOnly}
        showMultiplayerMenu={false}
        showSponsorLink={false}
        onExport={handleExport}
        darkMode={darkMode}
      />
    );
  },
);
