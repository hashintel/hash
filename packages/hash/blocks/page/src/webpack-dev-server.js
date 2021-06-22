/**
 * webpack-dev-server entry point for debugging.
 * This file is not bundled with the library during the build process.
 */
import React from "react";
import ReactDOM from "react-dom";
import Component from "./index.ts";
import content from "./content.json";
const node = document.getElementById("app");

const App = () => (
  <>
    <Component contents={content} />
  </>
);

ReactDOM.render(<App />, node);
