/**
 * webpack-dev-server entry point for debugging.
 * This file is not bundled with the library during the build process.
 */
import {
  BlockProtocolCreateLinksFunction,
  BlockProtocolDeleteLinksFunction,
  BlockProtocolLink,
  BlockProtocolUploadFileFunction,
} from "blockprotocol";

import React from "react";
import ReactDOM from "react-dom";
import Component from "./index";

const node = document.getElementById("app");

const App = () => {
  const uploadFile: BlockProtocolUploadFileFunction = async ({
    file,
    url,
    mediaType,
  }) => {
    return new Promise((resolve, reject) => {
      if (!file && !url) {
        reject(
          new Error(
            `Please enter a valid ${mediaType} URL or select a file below`,
          ),
        );
        return;
      }

      if (url?.trim()) {
        resolve({
          accountId: "account-xxx",
          entityId: "xxx",
          url,
          mediaType,
        });
        return;
      }

      if (file) {
        const reader = new FileReader();

        reader.onload = (event) => {
          if (event.target?.result) {
            resolve({
              accountId: "account-xxx",
              entityId: "xxx",
              url: event.target.result.toString(),
              mediaType,
            });
          } else {
            reject(new Error("Couldn't read your file"));
          }
        };

        reader.readAsDataURL(file);
      }
    });
  };

  const createLinks: BlockProtocolCreateLinksFunction = async () => {
    const results: BlockProtocolLink[] = [];
    return results;
  };

  const deleteLinks: BlockProtocolDeleteLinksFunction = async () => {
    return [true];
  };

  return (
    <div style={{ marginTop: 20 }}>
      <Component
        accountId="account-asdasd"
        createLinks={createLinks}
        deleteLinks={deleteLinks}
        initialCaption="A blooming flower"
        entityId="entity-asdasd"
        uploadFile={uploadFile}
        url="https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm"
      />
    </div>
  );
};

ReactDOM.render(<App />, node);
