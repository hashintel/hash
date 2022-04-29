import React, {
  useState,
  useCallback,
  // useEffect,
  useRef,
  useLayoutEffect,
} from "react";

import { BlockComponent } from "blockprotocol/react";
import { TDDocument, Tldraw, TldrawApp } from "@tldraw/tldraw";
import { handleExport, getInitialDocument } from "./utils";
import "./base.css";
import { ResizeBlock } from "./resize-block";
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
  darkMode = false,
  document,
  accountId,
  readOnly,
  updateEntities,
  height = 500,
  width,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rTldrawApp = useRef<TldrawApp>();
  const rInitialDocument = useRef<TDDocument>(
    getInitialDocument(document, entityId),
  );
  const [maxWidth, setMaxWidth] = useState(900);

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    setMaxWidth(containerRef.current.getBoundingClientRect().width);
  }, []);

  const updateRemoteData = useCallback(
    (newData: Partial<AppProps>) => {
      if (!rTldrawApp.current) return;
      const data = {
        document: newData.document ?? rTldrawApp.current.document,
        readOnly: newData.readOnly ?? readOnly,
        height: newData.height ?? height,
        width: newData.width ?? width,
      };

      console.log("data => ", data);

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
      readOnly,
      height,
      width,
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

  const updateDimensions = useCallback(
    (newWidth: number, newHeight: number) => {
      updateRemoteData({
        width: newWidth,
        height: newHeight,
      });
    },
    [updateRemoteData],
  );

  console.log({ width, height, maxWidth, document });

  return (
    <div ref={containerRef} className="drawing-canvas-container">
      <ResizeBlock
        width={width}
        height={height}
        maxWidth={maxWidth}
        updateDimensions={updateDimensions}
      >
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
