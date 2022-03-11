/**
 * This is the entry point for developing and debugging.
 * This file is not bundled with the library during the build process.
 */
import React from "react";
import ReactDOM from "react-dom";
import Component from "./index";

const node = document.getElementById("app");

const App = () => <Component color="red" entityId="divider1" height="2px" />;

ReactDOM.render(<App />, node);
