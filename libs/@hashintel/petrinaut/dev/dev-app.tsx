import React from "react";
import ReactDOM from "react-dom/client";
import { DevWrapper } from "./dev-wrapper";

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement,
);

root.render(
  <React.StrictMode>
    <DevWrapper />
  </React.StrictMode>,
);
