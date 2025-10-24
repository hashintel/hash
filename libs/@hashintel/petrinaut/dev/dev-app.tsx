import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { DevWrapper } from "./dev-wrapper";

const root = createRoot(document.getElementById("root") as HTMLElement);

root.render(
  <StrictMode>
    <DevWrapper />
  </StrictMode>,
);
