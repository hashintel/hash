import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useLayoutEffect,
} from "react";

import { BlockComponent } from "blockprotocol/react";
import { TDDocument, Tldraw, TldrawApp } from "@tldraw/tldraw";
import { Resizable, ResizeCallbackData } from "react-resizable";
import { handleExport, getInitialDocument } from "./utils";
import "./base.css";

type AppProps = {
  document: string;
  readOnly: boolean;
  darkMode?: boolean;
  width?: number;
  height?: number;
};

type LocalState = {
  height: number;
  width?: number;
  documentString: string;
  maxWidth?: number;
  darkMode?: boolean;
  readOnly?: boolean;
};

const BASE_HEIGHT = 500;

// @todo update image upload flow to leverage uploadFile
// to upload images. Currently images are saved in base64 form
// in the document and that isn't optimal

// @todo consider storing the document in .tldr files (which are uploaded
// via upload file hook) instead of JSON format. It's possible for the
// document to get very large, so storing in JSON

export const App: BlockComponent<AppProps> = ({
  entityId,
  entityTypeId,
  entityTypeVersionId,
  darkMode: remoteDarkMode = false,
  document: remoteDocumentString,
  accountId,
  readOnly: remoteReadOnly,
  updateEntities,
  height: remoteHeight,
  width: remoteWidth,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rTldrawApp = useRef<TldrawApp>();
  const rInitialDocument = useRef<TDDocument>(
    getInitialDocument(remoteDocumentString, entityId),
  );
  const [localState, setLocalState] = useState<LocalState>({
    height: remoteHeight ?? BASE_HEIGHT,
    ...(remoteWidth && { width: remoteWidth }),
    documentString: remoteDocumentString,
    darkMode: remoteDarkMode,
    readOnly: remoteReadOnly,
  });

  useLayoutEffect(() => {
    if (!containerRef.current) return;

    const handleResize = () => {
      const containerWidth = Number(
        containerRef.current?.getBoundingClientRect().width.toFixed(2),
      );

      setLocalState((prev) => ({
        ...prev,
        maxWidth: containerWidth,
        ...((!prev.width || (prev.maxWidth && prev.width >= prev.maxWidth)) && {
          width: containerWidth,
        }),
      }));
    };

    handleResize();

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    setLocalState((prev) => ({
      ...prev,
      darkMode: remoteDarkMode ?? prev.darkMode,
      height:
        // eslint-disable-next-line eqeqeq
        remoteHeight == undefined || Number.isNaN(remoteHeight)
          ? prev.height
          : remoteHeight,
      width:
        // eslint-disable-next-line eqeqeq
        remoteWidth == undefined || Number.isNaN(remoteWidth)
          ? prev.width
          : remoteWidth,
      documentString: remoteDocumentString ?? prev.documentString,
    }));
  }, [remoteDarkMode, remoteHeight, remoteWidth, remoteDocumentString]);

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

      void updateEntities?.([
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
      const parsedDocument = JSON.parse(
        localState.documentString,
      ) as TDDocument;
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
  }, [localState.documentString, entityId, localState.darkMode]);

  const updateDimensions = useCallback((_, { size }: ResizeCallbackData) => {
    setLocalState((prev) => ({
      ...prev,
      width: size.width,
      height: size.height,
    }));
  }, []);

  const updateRemoteDimensions = useCallback(
    (_, { size }: ResizeCallbackData) => {
      updateRemoteData({
        width: size.width,
        height: size.height,
      });
    },
    [updateRemoteData],
  );

  return (
    <div ref={containerRef} className="drawing-canvas-container">
      <Resizable
        height={localState.height}
        width={localState.width!}
        minConstraints={[200, 200]}
        maxConstraints={[localState.maxWidth!, Infinity]}
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
