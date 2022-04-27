import * as React from "react";

import { BlockComponent } from "blockprotocol/react";
import { TDDocument, Tldraw, TldrawApp } from "@tldraw/tldraw";

type AppProps = {
  name: string;
  document: string;
};

export const defaultDocument: TDDocument = {
  id: "doc",
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

const getInitialDocument = (document: string | undefined) => {
  try {
    return JSON.parse(document) as TDDocument;
  } catch (err) {
    return defaultDocument;
  }
};

export const App: BlockComponent<AppProps> = ({
  entityId,
  entityTypeId,
  entityTypeVersionId,
  name,
  document,
  updateEntities,
  accountId,
}) => {
  const rLoaded = React.useRef(false);
  const rTldrawApp = React.useRef<TldrawApp>();
  const rInitialDocument = React.useRef<TDDocument>(
    getInitialDocument(document),
  );

  const handleMount = React.useCallback((app: TldrawApp) => {
    rTldrawApp.current = app;
  }, []);

  const handlePersist = React.useCallback(
    (app: TldrawApp) => {
      const newDocument = JSON.stringify(app.document);
      // console.log("newDoc ==> ", app.document);
      // console.log("reason ==> ", reason);

      void updateEntities([
        {
          entityId,
          entityTypeId,
          entityTypeVersionId,
          accountId,
          data: {
            document: newDocument,
          },
        },
      ])
        .then((resp) => console.log(`Response from update: `, { resp }))
        .catch((err) => console.error(`Error updating entities: `, err));
    },
    [updateEntities, entityId, entityTypeId, entityTypeVersionId, accountId],
  );

  // const handleChange = (app: TldrawApp) => {
  //   // console.log("change ==> ", app.document);
  // };

  React.useEffect(() => {
    try {
      if (!rTldrawApp.current) return;
      const savedDocument = JSON.parse(document) as TDDocument;
      const app = rTldrawApp.current;
      if (rLoaded.current) {
        app.updateDocument(savedDocument);
      } else {
        app.loadDocument(savedDocument);
        rLoaded.current = true;
      }
      app.zoomToFit();
    } catch (e) {
      console.warn("error ==> ", e);
    }
  }, [document]);

  return (
    <div>
      <h1>Hello, {name}!</h1>
      <p>
        The entityId of this block is {entityId}. Use it to update its data when
        calling updateEntities.
      </p>
      <div
        style={{
          position: "relative",
          height: 600,
          width: "100%",
          margin: "0 auto",
        }}
      >
        <Tldraw
          document={rInitialDocument.current}
          onMount={handleMount}
          onPersist={handlePersist}
          // onChange={handleChange}
          showMultiplayerMenu={false}
          showSponsorLink={false}
          disableAssets // disabling this for now till we properly handle images
        />
      </div>
    </div>
  );
};
