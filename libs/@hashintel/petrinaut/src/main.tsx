import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { DevApp } from "./app";

const root = createRoot(document.getElementById("root")!);

root.render(
  <StrictMode>
    <DevApp />
  </StrictMode>,
);
