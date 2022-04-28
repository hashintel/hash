import * as React from "react";

import { BlockComponent } from "blockprotocol/react";
import { TDDocument, Tldraw, TldrawApp } from "@tldraw/tldraw";
import { handleExport, getInitialDocument } from "./utils";
import "./base.css";

type AppProps = {
  document: string;
  readOnly: boolean;
  darkMode: boolean;
};

export const App: BlockComponent<AppProps> = ({
  entityId,
  entityTypeId,
  entityTypeVersionId,
  darkMode = false,
  document,
  accountId,
  readOnly,
  updateEntities,
}) => {
  const rTldrawApp = React.useRef<TldrawApp>();
  const rInitialDocument = React.useRef<TDDocument>(
    getInitialDocument(document, entityId),
  );

  const handleMount = React.useCallback(
    (app: TldrawApp) => {
      rTldrawApp.current = app;

      if (darkMode !== rTldrawApp.current.settings.isDarkMode) {
        rTldrawApp.current.toggleDarkMode();
      }
    },
    [darkMode],
  );

  const handlePersist = React.useCallback(
    (app: TldrawApp) => {
      const newDocument = app.document;
      // ensure document's id is set to entityId on save
      newDocument.id = entityId;

      void updateEntities([
        {
          entityId,
          entityTypeId,
          entityTypeVersionId,
          accountId,
          data: {
            document: JSON.stringify(newDocument),
          },
        },
      ]);
    },
    [updateEntities, entityId, entityTypeId, entityTypeVersionId, accountId],
  );

  React.useEffect(() => {
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

  return (
    <div className="drawing-canvas-container">
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
    </div>
  );
};
