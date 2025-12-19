import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { DevApp } from "./main/app";

const root = createRoot(document.getElementById("root")!);

root.render(
  <StrictMode>
    <DevApp />
  </StrictMode>,
);
