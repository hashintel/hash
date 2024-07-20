/* eslint-disable canonical/filename-no-index -- @todo rename file */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { FramedBlock } from "./framed-block";

createRoot(document.querySelector("#root")!).render(
  <StrictMode>
    <FramedBlock />
  </StrictMode>,
);
