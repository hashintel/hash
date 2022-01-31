/**
 * webpack-dev-server entry point for debugging.
 * This file is not bundled with the library during the build process.
 */
import React from "react";
import ReactDOM from "react-dom";
import Component from "./index.ts";

const node = document.getElementById("app");

const App = () => <Component text="Hello World!" />;

ReactDOM.render(<App />, node);
