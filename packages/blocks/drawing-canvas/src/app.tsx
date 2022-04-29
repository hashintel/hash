import React, {
  useState,
  useCallback,
  // useEffect,
  useRef,
  useLayoutEffect,
  useEffect,
} from "react";

import { BlockComponent } from "blockprotocol/react";
import { TDDocument, Tldraw, TldrawApp } from "@tldraw/tldraw";
import { handleExport, getInitialDocument } from "./utils";
import "./base.css";
import { ResizeBlock } from "./resize-block";
import { throttle } from "lodash";
// import { Editor } from "./editor";

type AppProps = {
  document: string;
  readOnly: boolean;
  darkMode?: boolean;
  width?: number;
  height?: number;
};

export const App: BlockComponent<AppProps> = ({
  entityId,
  entityTypeId,
  entityTypeVersionId,
  darkMode: remoteDarkMode = false,
  document: remoteDocument,
  accountId,
  readOnly: remoteReadOnly,
  updateEntities,
  height: remoteHeight = 500,
  width: remoteWidth,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rTldrawApp = useRef<TldrawApp>();
  const rInitialDocument = useRef<TDDocument>(
    getInitialDocument(remoteDocument, entityId),
  );
  const [localState, setLocalState] = useState({
    height: remoteHeight,
    width: remoteWidth,
    maxWidth: 900,
    darkMode: remoteDarkMode,
    readOnly: remoteReadOnly,
  });

  // useLayoutEffect(() => {
  //   if (!containerRef.current) return;
  //   const handleResize = () => {
  //     console.log(
  //       "max-width => ",
  //       Number(containerRef.current?.getBoundingClientRect().width.toFixed(2)),
  //     );
  //     setLocalState((prev) => ({
  //       ...prev,
  //       maxWidth: Number(
  //         containerRef.current?.getBoundingClientRect().width.toFixed(2),
  //       ),
  //     }));
  //   };

  //   document.addEventListener("resize", handleResize);

  //   return () => {
  //     document.removeEventListener("resize", handleResize);
  //   };
  // }, []);

  useEffect(() => {
    setLocalState((prev) => ({
      ...prev,
      darkMode: remoteDarkMode ?? prev.darkMode,
      height: remoteHeight ?? prev.height,
      width: remoteWidth ?? prev.width,
      // document: remoteDocument ?? prev.document,
    }));
  }, [remoteDarkMode, remoteHeight, remoteWidth]);

  const updateRemoteData = useCallback(
    (newData: Partial<AppProps>) => {
      if (!rTldrawApp.current) return;
      const data = {
        document: newData.document ?? rTldrawApp.current.document,
        readOnly: newData.readOnly ?? localState.readOnly,
        height: newData.height ?? localState.height,
        width: newData.width ?? localState.width,
      };

      void updateEntities([
        {
          entityId,
          entityTypeId,
          entityTypeVersionId,
          accountId,
          data,
        },
      ]);

      setLocalState((prev) => ({
        ...prev,
        ...data,
      }));
    },
    [
      localState,
      updateEntities,
      entityId,
      entityTypeId,
      entityTypeVersionId,
      accountId,
    ],
  );

  const handleMount = useCallback(
    (app: TldrawApp) => {
      rTldrawApp.current = app;

      if (localState.darkMode !== rTldrawApp.current.settings.isDarkMode) {
        rTldrawApp.current.toggleDarkMode();
      }
    },
    [localState.darkMode],
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
      const parsedRemoteDocument = JSON.parse(remoteDocument) as TDDocument;
      const app = rTldrawApp.current;

      // update document if its id hasn't changed. load document if it has
      if (parsedRemoteDocument.id && parsedRemoteDocument.id === entityId) {
        app.updateDocument(parsedRemoteDocument);
      } else {
        // saved documents should have an id which points to the entityId supplied.
        if (!parsedRemoteDocument.id) parsedRemoteDocument.id = entityId;
        app.loadDocument(parsedRemoteDocument);
        app.zoomToFit();
      }

      if (localState.darkMode !== app.settings.isDarkMode) {
        app.toggleDarkMode();
      }
    } catch (err) {
      // todo handle error
    }
  }, [remoteDocument, entityId, localState.darkMode]);

  const updateDimensions = useCallback(
    (newWidth: number, newHeight: number) => {
      updateRemoteData({
        width: newWidth,
        height: newHeight,
      });
    },
    [updateRemoteData],
  );

  console.log("local ==> ", localState);
  console.log("remote => ", {
    width: remoteWidth,
    height: remoteHeight,
    maxWidth: localState.maxWidth,
    document: remoteDocument,
  });

  useEffect(() => {
    console.log("re-rendered");
  });

  return (
    <div ref={containerRef} className="drawing-canvas-container">
      <ResizeBlock
        width={localState.width}
        height={localState.height}
        maxWidth={localState.maxWidth}
        updateDimensions={updateDimensions}
      >
        <Tldraw
          document={rInitialDocument.current}
          onMount={handleMount}
          onPersist={handlePersist}
          readOnly={remoteReadOnly}
          showMultiplayerMenu={false}
          showSponsorLink={false}
          onExport={handleExport}
          darkMode={remoteDarkMode}
        />
        {/* <Editor
          document={document}
          entityId={entityId}
          darkMode={darkMode}
          readOnly={readOnly}
          updateRemoteData={updateRemoteData}
          // appRef={rTldrawApp}
        /> */}
      </ResizeBlock>
      {/* <Editor
        document={document}
        entityId={entityId}
        darkMode={darkMode}
        readOnly={readOnly}
        updateRemoteData={updateRemoteData}
        // appRef={rTldrawApp}
      /> */}
    </div>
  );
};
