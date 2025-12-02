import "./style.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Playground } from "./playground";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Failed to find the root element");
}

createRoot(rootElement).render(
  <StrictMode>
    <Playground />
  </StrictMode>,
);
