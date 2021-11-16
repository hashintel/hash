/**
 * webpack-dev-server entry point for debugging.
 * This file is not bundled with the library during the build process.
 */
import { BlockProtocolFileUploadFn } from "@hashintel/block-protocol";
import React from "react";
import ReactDOM from "react-dom";
import { tw } from "twind";
import Component from "./index";

const node = document.getElementById("app");

const App = () => {
  const uploadFile: BlockProtocolFileUploadFn = async ({
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

  return (
    <div className={tw`mt-5`}>
      <Component
        initialSrc="https://www.google.com/logos/doodles/2021/doodle-champion-island-games-july-26-6753651837109017-s.png"
        initialCaption="ASDASDASDSAD"
        entityId="entity-asdasd"
        uploadFile={uploadFile}
      />
    </div>
  );
};

ReactDOM.render(<App />, node);
