import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { DevApp } from "./app";

const root = createRoot(document.getElementById("root") as HTMLElement);

root.render(
  <StrictMode>
    <DevApp />
  </StrictMode>,
);
