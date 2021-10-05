/**
 * webpack-dev-server entry point for debugging.
 * This file is not bundled with the library during the build process.
 */
import React from "react";
import ReactDOM from "react-dom";
import Component from "./index";

const node = document.getElementById("app");

const App = () => {
  const uploadFile = async ({
    file,
    url,
    mime,
  }: {
    file?: File;
    url?: string;
    mime?: string;
  }): Promise<{
    src?: string;
  }> => {
    if (url?.trim()) {
      return { src: url };
    }

    if (!file) {
      let fileType = "";

      if (mime) {
        if (mime.includes("image")) {
          fileType = "Image";
        }

        if (mime.includes("video")) {
          fileType = "Video";
        }
      }

      throw new Error(
        `Please enter a valid  ${
          fileType ? `${fileType} ` : ""
        }URL or select a file below`
      );
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (event) => {
        if (event.target?.result) {
          resolve({ src: event.target.result.toString() });
        } else {
          reject(new Error("Couldn't read your file"));
        }
      };

      reader.readAsDataURL(file);
    });
  };

  return (
    <div style={{ marginTop: 20 }}>
      <Component
        initialSrc={
          "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm"
        }
        initialCaption={"ASDASDASDSAD"}
        entityId={"entity-asdasd"}
        uploadFile={uploadFile}
      />
    </div>
  );
};

ReactDOM.render(<App />, node);
