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
import { Resizable } from "react-resizable";
import { handleExport, getInitialDocument } from "./utils";
import "./base.css";

type AppProps = {
  document: string;
  readOnly: boolean;
  darkMode?: boolean;
  width?: number;
  height?: number;
};

type ResizeCallbackData = {
  node: HTMLElement;
  size: { width: number; height: number };
  handle: "s" | "w" | "e" | "n" | "sw" | "nw" | "se" | "ne";
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
    document: remoteDocument,
    maxWidth: 900,
    darkMode: remoteDarkMode,
    readOnly: remoteReadOnly,
  });

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const newMaxWidth = Number(
      containerRef.current?.getBoundingClientRect().width.toFixed(2),
    );

    // @todo handle resizing

    setLocalState((prev) => ({
      ...prev,
      maxWidth: newMaxWidth,
      ...(!prev.width && { width: newMaxWidth }),
    }));
  }, []);

  useEffect(() => {
    setLocalState((prev) => ({
      ...prev,
      darkMode: remoteDarkMode ?? prev.darkMode,
      height: remoteHeight ?? prev.height,
      width: remoteWidth ?? prev.width,
      document: remoteDocument ?? prev.document,
    }));
  }, [remoteDarkMode, remoteHeight, remoteWidth, remoteDocument]);

  const updateRemoteData = useCallback(
    (newData: Partial<AppProps>) => {
      if (!rTldrawApp.current) return;
      const data = {
        document:
          newData.document ?? JSON.stringify(rTldrawApp.current.document),
        readOnly:
          newData.readOnly ?? rTldrawApp.current.settings.isReadonlyMode,
        darkMode: newData.darkMode ?? rTldrawApp.current.settings.isDarkMode,
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
      const parsedDocument = JSON.parse(localState.document) as TDDocument;
      const app = rTldrawApp.current;

      // update document if its id hasn't changed. load document if it has
      if (parsedDocument.id && parsedDocument.id === entityId) {
        app.updateDocument(parsedDocument);
      } else {
        // saved documents should have an id which points to the entityId supplied.
        if (!parsedDocument.id) parsedDocument.id = entityId;
        app.loadDocument(parsedDocument);
        app.zoomToFit();
      }

      if (localState.darkMode !== app.settings.isDarkMode) {
        app.toggleDarkMode();
      }
    } catch (err) {
      // todo handle error
    }
  }, [localState.document, entityId, localState.darkMode]);

  const updateDimensions = useCallback((_, { size }: ResizeCallbackData) => {
    setLocalState((prev) => ({
      ...prev,
      width: size.width,
      height: size.height,
    }));
  }, []);

  const updateRemoteDimensions = useCallback(
    (_, { size }: ResizeCallbackData) => {
      if (!rTldrawApp.current) return;
      // rTldrawApp.current
      updateRemoteData({
        width: size.width,
        height: size.height,
      });
    },
    [updateRemoteData],
  );

  // console.log("local ==> ", localState);
  // console.log("remote => ", {
  //   width: remoteWidth,
  //   height: remoteHeight,
  //   maxWidth: localState.maxWidth,
  //   document: remoteDocument,
  // });

  useEffect(() => {
    // console.log("re-rendered");
  });

  return (
    <div ref={containerRef} className="drawing-canvas-container">
      <Resizable
        height={localState.height}
        width={localState.width}
        minConstraints={[200, 200]}
        maxConstraints={[localState.maxWidth, Infinity]}
        onResize={updateDimensions}
        onResizeStop={updateRemoteDimensions}
        resizeHandles={["s", "se", "e", "sw"]}
      >
        <div
          style={{
            height: localState.height,
            width: localState.width,
            position: "relative",
          }}
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
        </div>
      </Resizable>
    </div>
  );
};
