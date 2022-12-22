/* eslint-disable canonical/filename-no-index -- @todo rename file */

import { StrictMode } from "react";
import { render } from "react-dom";

import { FramedBlock } from "./FramedBlock";

render(
  <StrictMode>
    <FramedBlock />
  </StrictMode>,
  document.getElementById("root"),
);
