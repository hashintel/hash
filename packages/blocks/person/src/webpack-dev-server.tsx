/**
 * webpack-dev-server entry point for debugging.
 * This file is not bundled with the library during the build process.
 */
import React from "react";
import ReactDOM from "react-dom";
import Component from "./index";

const node = document.getElementById("app");

const props = {
  avatar: "https://i.pravatar.cc/300",
  employer: {
    name: "General Manager of Insurance Claims",
    position: "Bain & Co.",
  },
  name: "Archibald Adams-Montgomery",
  email: "alice@example.com",
  link: "https://alice.com/about",
};

const App = () => <Component {...props} />;

ReactDOM.render(<App />, node);
