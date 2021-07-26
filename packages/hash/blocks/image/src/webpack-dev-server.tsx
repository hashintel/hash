/**
 * webpack-dev-server entry point for debugging.
 * This file is not bundled with the library during the build process.
 */
import React from "react";
import ReactDOM from "react-dom";
import Component from "./index";

const node = document.getElementById("app");

const App = () => {
  const uploadImage = async ({
    file,
    imgURL,
  }: {
    file?: File;
    imgURL?: string;
  }): Promise<{
    src?: string;
    error?: string;
  }> => {
    if (imgURL?.trim()) {
      return { src: imgURL };
    }

    if (file) {
      return new Promise((resolve) => {
        const reader = new FileReader();

        reader.onload = function (e) {
          if (e.target?.result) {
            resolve({ src: e.target.result.toString() });
          } else {
            resolve({ error: "Couldn't read your file" });
          }
        };

        reader.readAsDataURL(file);
      });
    }

    return {
      error: "Please enter a valid image URL or select a file below",
    };
  };

  return (
    <div style={{ marginTop: 20 }}>
      <Component entityId={"entity-asdasd"} height={500} uploadImage={uploadImage} />
    </div>
  );
};

ReactDOM.render(<App />, node);
